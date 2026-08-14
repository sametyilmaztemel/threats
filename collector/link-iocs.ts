// link-iocs.ts — doküman içeriklerindeki IOC değerlerini iocs tablosuna bağlar
// Strateji: her dokümanın title+content+summary'ından regex ile IP/domain/URL çıkar,
// iocs tablosunda ara (tek toplu sorgu), document_iocs junction'a yaz.
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[link-iocs] ${m}`);

const IPV4_RE = /\b((?:\d{1,3}\.){3}\d{1,3})\b/g;
const DOMAIN_RE = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|co|xyz|top|ru|cn|info|biz|shop|online|site|live|cloud|dev|app|click|link|tk|ml|ga|cf|gq|cc|me|tv|biz|us|uk|de|fr|tr)\b)/gi;
const URL_RE = /https?:\/\/([a-z0-9.-]+)/gi;

function validIp(ip: string): boolean {
  return ip.split('.').every(o => parseInt(o, 10) <= 255);
}

async function main() {
  // 1) Tüm dokümanları çek (son 90 gün, içerikli)
  const { rows: docs } = await pool.query<any>(
    `SELECT d.id, d.title, COALESCE(d.content,'') as content, COALESCE(d.summary,'') as summary
     FROM documents d
     WHERE d.fetched_at > NOW() - interval '90 days'
     ORDER BY d.id`
  );
  log(`${docs.length} doküman taranacak`);

  // 2) Her dokümandan aday değerler çıkar
  const candidates = new Map<string, Set<number>>(); // value → doc ids
  for (const d of docs) {
    const text = `${d.title || ''} ${d.summary || ''} ${d.content || ''}`.toLowerCase();
    const found = new Set<string>();

    for (const m of text.matchAll(IPV4_RE)) {
      const ip = m[1];
      if (validIp(ip) && !ip.startsWith('0.')) found.add(ip);
    }
    for (const m of text.matchAll(DOMAIN_RE)) {
      const dom = m[1].toLowerCase();
      if (dom.length > 4 && !dom.endsWith('.com.') && dom.split('.').length >= 2) found.add(dom);
    }
    for (const m of text.matchAll(URL_RE)) {
      const host = m[1].toLowerCase();
      if (host.split('.').length >= 2) found.add(host);
    }

    for (const v of found) {
      if (!candidates.has(v)) candidates.set(v, new Set());
      candidates.get(v)!.add(d.id);
    }
  }
  log(`${candidates.size} benzersiz aday değer`);

  // 3) Adayları iocs tablosunda ara (chunk'lı IN sorgusu)
  //    - domain/IP adayları: LOWER(value) eşleşmesi
  //    - URL adayları: value host kısmı eşleşmesi (malicious_url tipi https://host/path)
  const values = [...candidates.keys()];
  const urlCandidates = new Set<string>(); // full URL'ler
  for (const d of docs) {
    const text = `${d.title || ''} ${d.summary || ''} ${d.content || ''}`;
    for (const m of text.matchAll(/https?:\/\/[a-z0-9.\-:/_%?=&~+#]+/gi)) {
      const u = m[0];
      if (u.length < 12 && u.length > 500) continue;
      urlCandidates.add(u.toLowerCase());
    }
  }
  log(`${values.length} host/domain aday + ${urlCandidates.size} URL aday`);
  let linked = 0, docCount = 0;
  const linkedDocIds = new Set<number>();

  // a) host/domain eşleşmesi
  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500);
    const { rows: iocRows } = await pool.query<any>(
      `SELECT id, value, type FROM iocs WHERE LOWER(value) = ANY($1::text[])`,
      [chunk]
    );
    for (const ioc of iocRows) {
      const docIds = candidates.get(ioc.value.toLowerCase());
      if (!docIds) continue;
      for (const docId of docIds) {
        await pool.query(
          `INSERT INTO document_iocs (document_id, ioc_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [docId, ioc.id]
        );
        linked++;
        linkedDocIds.add(docId);
      }
    }
  }

  // b) URL eşleşmesi (malicious_url / phishing_url değerleri)
  const urlDocMap = new Map<string, Set<number>>();
  for (const d of docs) {
    const text = `${d.title || ''} ${d.summary || ''} ${d.content || ''}`.toLowerCase();
    for (const m of text.matchAll(/https?:\/\/[a-z0-9.\-:/_%?=&~+#]+/gi)) {
      const u = m[0].toLowerCase();
      if (u.length < 12 && u.length > 500) continue;
      if (!urlDocMap.has(u)) urlDocMap.set(u, new Set());
      urlDocMap.get(u)!.add(d.id);
    }
  }
  for (let i = 0; i < urlCandidates.size; i += 300) {
    const chunk = [...urlCandidates].slice(i, i + 300);
    const { rows: iocRows } = await pool.query<any>(
      `SELECT id, value, type FROM iocs
       WHERE type IN ('malicious_url','phishing_url')
         AND LOWER(value) = ANY($1::text[])`,
      [chunk]
    );
    for (const ioc of iocRows) {
      const docIds = urlDocMap.get(ioc.value.toLowerCase());
      if (docIds) {
        for (const docId of docIds) {
          await pool.query(
            `INSERT INTO document_iocs (document_id, ioc_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [docId, ioc.id]
          );
          linked++;
          linkedDocIds.add(docId);
        }
      }
    }
  }
  log(`toplam ${linked} bağlantı eklendi (${linkedDocIds.size} doküman)`);

  // 4) documents.ioc_count güncelle
  const { rows: counts } = await pool.query<any>(
    `SELECT document_id, COUNT(*)::int as cnt FROM document_iocs GROUP BY document_id`
  );
  for (const c of counts) {
    await pool.query(`UPDATE documents SET ioc_count = $1 WHERE id = $2`, [c.cnt, c.document_id]);
  }
  log(`ioc_count güncellendi: ${counts.length} doküman`);

  await pool.end();
  log('TAMAM');
}

main().catch(e => { console.error(e); process.exit(1); });
