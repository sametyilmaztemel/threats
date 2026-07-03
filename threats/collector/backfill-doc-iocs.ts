// backfill-doc-iocs.ts — Extract IOCs from existing document content
// One-shot script. Reads all documents with content, regex-extracts IPs/domains/URLs/hashes,
// inserts into iocs + document_iocs. Idempotent via unique constraint.

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Same regex set as collect-rss.mts (to be added there)
const REGEX = {
  ipv4: /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g,
  url: /\bhttps?:\/\/[^\s<>"'(){}\[\]]+[^\s<>"'(){}\[\].,;:!?]/g,
  md5: /\b[a-f0-9]{32}\b/gi,
  sha1: /\b[a-f0-9]{40}\b/gi,
  sha256: /\b[a-f0-9]{64}\b/gi,
};

const DOMAIN_REGEX = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b/gi;

function isIPv4Private(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p[0] === 10) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 127) return true;
  if (p[0] === 0) return true;
  if (p[0] >= 224) return true; // multicast/reserved
  return false;
}

function isBadDomain(d: string): boolean {
  // Filter common false positives in threat intel text
  if (/^(www|com|net|org|io|gov|edu)\.[a-z]{2,4}$/i.test(d)) return false; // looks like TLD alone, skip
  const genericTLDs = ['com', 'net', 'org', 'io', 'co', 'ai', 'app', 'dev', 'xyz', 'info', 'biz', 'us', 'uk', 'de', 'fr', 'ru', 'cn'];
  const tld = d.split('.').pop()!.toLowerCase();
  if (!genericTLDs.includes(tld) && tld.length < 3) return false; // 2-char ccTLD ok too
  // Common false positives in RSS content (CSS units etc.)
  if (/^[0-9]+x[0-9]+$/.test(d)) return true; // 1920x1080 etc.
  return false;
}

interface ExtractedIOC {
  value: string;
  type: string;
}

function extractIOCs(text: string): ExtractedIOC[] {
  if (!text) return [];
  const out: ExtractedIOC[] = [];
  const seen = new Set<string>();

  // URLs (must come before domains)
  for (const m of text.matchAll(REGEX.url)) {
    const v = m[0].replace(/[.,;:!?)]+$/g, '').trim();
    if (v.length < 10 || v.length > 2000) continue;
    const k = `malicious_url|${v}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: v, type: 'malicious_url' });
  }

  // IPv4 (filter private/reserved)
  for (const m of text.matchAll(REGEX.ipv4)) {
    if (isIPv4Private(m[0])) continue;
    const k = `c2_ip|${m[0]}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: m[0], type: 'c2_ip' });
  }

  // SHA256 (most specific)
  for (const m of text.matchAll(REGEX.sha256)) {
    const k = `sha256|${m[0].toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: m[0].toLowerCase(), type: 'sha256' });
  }

  // SHA1
  for (const m of text.matchAll(REGEX.sha1)) {
    // skip if part of sha256
    if (seen.has(`sha256|${m[0].toLowerCase()}`)) continue;
    const k = `sha1|${m[0].toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: m[0].toLowerCase(), type: 'sha1' });
  }

  // MD5
  for (const m of text.matchAll(REGEX.md5)) {
    if (seen.has(`sha1|${m[0].toLowerCase()}`)) continue;
    if (seen.has(`sha256|${m[0].toLowerCase()}`)) continue;
    const k = `md5|${m[0].toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: m[0].toLowerCase(), type: 'md5' });
  }

  // Domains (rough — domains already captured inside URLs will be re-added as domain entries;
  // but the unique constraint (value, type, document_id) prevents duplicates)
  for (const m of text.matchAll(DOMAIN_REGEX)) {
    const d = m[0].toLowerCase();
    if (isBadDomain(d)) continue;
    if (d.length < 4 || d.length > 253) continue;
    // Skip very short or weird patterns
    if (/^\d+\.\d+$/.test(d)) continue; // version numbers
    const k = `domain|${d}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: d, type: 'domain' });
  }

  return out;
}

async function main() {
  const { rows: docs } = await pool.query<any>(
    `SELECT id, title, content FROM documents
     WHERE content IS NOT NULL AND length(content) > 50
     ORDER BY id DESC`
  );
  console.log(`[backfill] processing ${docs.length} documents...`);

  let docCount = 0;
  let iocInserted = 0;
  let linkInserted = 0;
  let errors = 0;
  const t0 = Date.now();

  for (const doc of docs) {
    try {
      const iocs = extractIOCs(doc.content + ' ' + (doc.title || ''));
      if (iocs.length === 0) { docCount++; continue; }
      for (const i of iocs) {
        try {
          const r = await pool.query(
            `INSERT INTO iocs (value, type, document_id, source_id, confidence, ai_related, meta)
             VALUES ($1, $2, $3, NULL, 0.6, FALSE, $4)
             ON CONFLICT (value, type, document_id) DO NOTHING
             RETURNING id`,
            [i.value, i.type, doc.id, JSON.stringify({ extraction: 'document_content', doc_id: doc.id })]
          );
          if (r.rowCount && r.rowCount > 0) {
            iocInserted++;
            await pool.query(
              `INSERT INTO document_iocs (document_id, ioc_id) VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [doc.id, r.rows[0].id]
            );
            linkInserted++;
          }
        } catch (e: any) {
          errors++;
          if (errors <= 3) console.error(`  [doc ${doc.id}] insert error: ${e.message}`);
        }
      }
    } catch (e: any) {
      errors++;
    }
    docCount++;
    if (docCount % 100 === 0) console.log(`  [${docCount}/${docs.length}] IOCs: ${iocInserted}, links: ${linkInserted}`);
  }

  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[backfill] done in ${sec}s. docs=${docCount} iocs_inserted=${iocInserted} links=${linkInserted} errors=${errors}`);

  // Recompute documents.ioc_count for docs that gained links
  console.log('[backfill] recomputing documents.ioc_count...');
  await pool.query(`
    UPDATE documents d SET ioc_count = COALESCE(sub.cnt, 0)
    FROM (
      SELECT document_id, COUNT(*) AS cnt
      FROM document_iocs
      WHERE document_id IS NOT NULL
      GROUP BY document_id
    ) sub
    WHERE d.id = sub.document_id
  `);
  console.log('[backfill] ioc_count recomputed.');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });