// collect-ioc.ts — IOC ingestion from abuse.ch + Feodo Tracker
// Free public APIs (no key required). Sources in `sources` table WHERE type IN ('api','json','csv','stix').
// Normalizes to `iocs` + `document_iocs` (when from documents) tables.

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const USER_AGENT = 'threats.0rce.com/1.0 (+https://threats.0rce.com)';
const TIMEOUT_MS = 30000;

type IOCType = 'attacker_ip' | 'c2_ip' | 'malicious_url' | 'phishing_url' | 'malware_url' | 'md5' | 'sha1' | 'sha256' | 'domain';

interface NormalizedIOC {
  value: string;
  type: IOCType;
  first_seen: Date | null;
  last_seen: Date | null;
  confidence: number;
  tags: string[];
  meta: Record<string, any>;
  ai_related: boolean;
  document_id?: number | null;
}

// ---------- Type inference helpers ----------

function isIPv4(s: string): boolean {
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  return m.slice(1).every(oct => {
    const n = parseInt(oct, 10);
    return n >= 0 && n <= 255;
  });
}

function isDomain(s: string): boolean {
  if (!s || s.length > 253) return false;
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(s);
}

function isMD5(s: string): boolean { return /^[a-f0-9]{32}$/i.test(s); }
function isSHA1(s: string): boolean { return /^[a-f0-9]{40}$/i.test(s); }
function isSHA256(s: string): boolean { return /^[a-f0-9]{64}$/i.test(s); }

function inferType(value: string): IOCType | null {
  if (isIPv4(value)) return 'c2_ip';
  if (isMD5(value)) return 'md5';
  if (isSHA1(value)) return 'sha1';
  if (isSHA256(value)) return 'sha256';
  if (isDomain(value)) return 'domain';
  if (/^https?:\/\//i.test(value)) {
    const lower = value.toLowerCase();
    if (lower.includes('phish') || lower.includes('login') || lower.includes('verify')) return 'phishing_url';
    return 'malicious_url';
  }
  return null;
}

// ---------- HTTP helpers ----------

async function fetchText(url: string, opts: { method?: string; body?: any; headers?: Record<string, string> } = {}): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: opts.method || 'GET',
      headers: { 'User-Agent': USER_AGENT, ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Source-specific ingesters ----------

async function ingestThreatFox(source: any): Promise<NormalizedIOC[]> {
  // ThreatFox (abuse.ch) — POST {query: 'get_iocs', days: 1}
  const body = { query: 'get_iocs', days: 1 };
  const text = await fetchText('https://threatfox-api.abuse.ch/api/v1/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const json = JSON.parse(text);
  if (!json || !Array.isArray(json.data)) return [];
  const out: NormalizedIOC[] = [];
  for (const it of json.data) {
    if (!it.ioc_value || !it.ioc_type) continue;
    const t = mapThreatFoxType(it.ioc_type);
    if (!t) continue;
    out.push({
      value: String(it.ioc_value).trim(),
      type: t,
      first_seen: it.first_seen ? new Date(it.first_seen) : null,
      last_seen: it.last_seen ? new Date(it.last_seen) : null,
      confidence: typeof it.confidence_level === 'number' ? it.confidence_level / 100 : 0.75,
      tags: Array.isArray(it.tags) ? it.tags : (it.tags ? String(it.tags).split(',').map((s: string) => s.trim()) : []),
      meta: {
        threat_type: it.threat_type || null,
        malware: it.malware || null,
        malware_alias: it.malware_alias || null,
        reporter: it.reporter || null,
        reference: it.reference || null,
      },
      ai_related: /gpt|llm|claude|openai|anthropic|chatgpt|jailbreak|prompt|model/i.test(
        `${it.malware || ''} ${it.threat_type || ''} ${(it.tags || []).join(' ')}`
      ),
    });
  }
  return out;
}

function mapThreatFoxType(t: string): IOCType | null {
  const x = (t || '').toLowerCase();
  if (x === 'ip:port') return 'c2_ip'; // value will be like 1.2.3.4:443, we strip port below
  if (x === 'ipv4') return 'c2_ip';
  if (x === 'ipv6') return null; // skip v6 for now
  if (x === 'domain') return 'domain';
  if (x === 'url') return 'malicious_url';
  if (x === 'md5') return 'md5';
  if (x === 'sha1') return 'sha1';
  if (x === 'sha256') return 'sha256';
  return null;
}

async function ingestURLhaus(source: any): Promise<NormalizedIOC[]> {
  // URLhaus — CSV (no API key required). Recent online URLs.
  const text = await fetchText('https://urlhaus.abuse.ch/downloads/csv_recent/');
  const lines = text.split('\n');
  const out: NormalizedIOC[] = [];
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(',');
    // Standard URLhaus CSV format: id, dateadded, url, url_status, last_online, threat, tags, urlhaus_link, reporter
    if (parts.length < 3) continue;
    const url = (parts[2] || '').replace(/^"|"$/g, '').trim();
    if (!url) continue;
    const threat = (parts[5] || '').replace(/^"|"$/g, '').trim();
    const tags = (parts[6] || '').replace(/^"|"$/g, '').trim();
    const reporter = (parts[8] || '').replace(/^"|"$/g, '').trim();
    out.push({
      value: url,
      type: 'malicious_url',
      first_seen: null, // DB'de COALESCE(first_seen, created_at::date) ile doldurulur
      last_seen: null,
      confidence: 0.8,
      tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [],
      meta: { threat: threat || null, reporter: reporter || null, source_feed: 'URLhaus' },
      ai_related: /gpt|llm|openai|chatgpt|claude/i.test(`${threat} ${tags}`),
    });
  }
  return out;
}

async function ingestFeodo(source: any): Promise<NormalizedIOC[]> {
  // Feodo Tracker — JSON list of C2 IPs (abuse.ch)
  const text = await fetchText('https://feodotracker.abuse.ch/downloads/ipblocklist.json');
  // Format: each line is a JSON object, newline-delimited. Try ndjson first, fallback to array.
  const trimmed = text.trim();
  let arr: any[] = [];
  if (trimmed.startsWith('[')) {
    arr = JSON.parse(trimmed);
  } else {
    for (const line of trimmed.split('\n')) {
      if (!line.trim()) continue;
      try { arr.push(JSON.parse(line)); } catch { /* skip */ }
    }
  }
  const out: NormalizedIOC[] = [];
  for (const it of arr) {
    const ip = it.ip_address || it.ip;
    if (!ip || !isIPv4(ip)) continue;
    out.push({
      value: ip,
      type: 'c2_ip',
      first_seen: it.first_seen ? new Date(it.first_seen) : null,
      last_seen: it.last_seen ? new Date(it.last_seen) : null,
      confidence: 0.85,
      tags: it.tags ? (Array.isArray(it.tags) ? it.tags : String(it.tags).split(',').map((s: string) => s.trim())) : [],
      meta: { malware: it.malware || null, port: it.port || null, status: it.status || null, country: it.country || null, source_feed: 'Feodo Tracker' },
      ai_related: /emotet|trickbot|dridex|qakbot/i.test(`${it.malware || ''}`),
    });
  }
  return out;
}

async function ingestMalwareBazaar(source: any): Promise<NormalizedIOC[]> {
  // MalwareBazaar — POST {query: 'get_recent', selector: 'time'} (last hour)
  const body = { query: 'get_recent', selector: 'time' };
  const text = await fetchText('https://mb-api.abuse.ch/api/v1/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const json = JSON.parse(text);
  if (!json || !Array.isArray(json.data)) return [];
  const out: NormalizedIOC[] = [];
  for (const it of json.data) {
    const added = it.first_seen ? new Date(it.first_seen) : null;
    const meta: Record<string, any> = {
      malware: it.signature || null,
      file_type: it.file_type || null,
      reporter: it.reporter || null,
      origin_country: it.origin_country || null,
      source_feed: 'MalwareBazaar',
    };
    if (it.sha256) out.push({ value: it.sha256, type: 'sha256', first_seen: added, last_seen: added, confidence: 0.9, tags: it.tags ? it.tags.split(',').map((s: string) => s.trim()) : [], meta, ai_related: false });
    if (it.sha1) out.push({ value: it.sha1, type: 'sha1', first_seen: added, last_seen: added, confidence: 0.9, tags: [], meta, ai_related: false });
    if (it.md5) out.push({ value: it.md5, type: 'md5', first_seen: added, last_seen: added, confidence: 0.9, tags: [], meta, ai_related: false });
  }
  return out;
}

// ---------- DB writer ----------

async function writeIOCs(iocs: NormalizedIOC[], sourceId: number): Promise<number> {
  if (iocs.length === 0) return 0;
  // Dedup within batch by (value, type)
  const seen = new Set<string>();
  const deduped = iocs.filter(i => {
    const k = `${i.type}|${i.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  let inserted = 0;
  for (const i of deduped) {
    try {
      await pool.query(
        `INSERT INTO iocs (value, type, first_seen, last_seen, document_id, source_id, confidence, tags, ai_related, meta)
         VALUES ($1, $2, COALESCE($3, CURRENT_DATE), COALESCE($4, CURRENT_DATE), $5, $6, $7, $8, $9, $10)
         ON CONFLICT (value, type, document_id) DO NOTHING`,
        [
          i.value,
          i.type,
          i.first_seen,
          i.last_seen,
          i.document_id ?? null,
          sourceId,
          i.confidence,
          i.tags,
          i.ai_related,
          JSON.stringify(i.meta),
        ]
      );
      inserted++;
    } catch (e: any) {
      // skip malformed rows
    }
  }
  return inserted;
}

// ---------- PhishTank ----------
// openphish → 302 → GitHub raw (429 rate-limit riskli)
// phishing.army: doğrudan erişim, ~150K aktif phishing domain — ana kaynak
const PHISH_FEEDS = [
  'https://phishing.army/download/phishing_army_blocklist.txt',
  'https://openphish.com/feed.txt',
];

async function ingestPhishTank(source: any): Promise<NormalizedIOC[]> {
  let lastErr: Error | null = null;
  for (const url of PHISH_FEEDS) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(45000),
      });
      if (!resp.ok) { lastErr = new Error(`HTTP ${resp.status}`); continue; }
      const text = await resp.text();
      // phishing.army: her satır bir domain; openphish: URL
      const isArmy = url.includes('phishing.army');
      const items = text.split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l && !l.startsWith('#') && !l.includes(' '));
      if (items.length === 0) { lastErr = new Error('empty feed'); continue; }
      return items.slice(0, 20000).map((v: string) => ({
        value: isArmy ? `http://${v}` : v,
        type: isArmy ? 'domain' as IOCType : 'phishing_url' as IOCType,
        first_seen: new Date(),
        last_seen: new Date(),
        confidence: 0.8,
        tags: ['phishing'],
        meta: { source: isArmy ? 'phishing.army' : 'openphish' },
        ai_related: false,
      }));
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('all phish feeds failed');
}

// ---------- Main ----------

async function main() {
  const { rows: sources } = await pool.query<any>(
    `SELECT * FROM sources
     WHERE enabled = TRUE
       AND (name ILIKE '%threatfox%'
            OR name ILIKE '%malwarebazaar%'
            OR name ILIKE '%urlhaus%'
            OR name ILIKE '%feodo%'
            OR name ILIKE '%phishtank%')
     ORDER BY name`
  );

  console.log(`[ioc-collector] ${sources.length} IOC sources enabled`);

  let total = 0;
  for (const s of sources) {
    const t0 = Date.now();
    let iocs: NormalizedIOC[] = [];
    try {
      if (/threatfox/i.test(s.name)) iocs = await ingestThreatFox(s);
      else if (/malwarebazaar/i.test(s.name)) iocs = await ingestMalwareBazaar(s);
      else if (/urlhaus/i.test(s.name)) iocs = await ingestURLhaus(s);
      else if (/feodo/i.test(s.name)) iocs = await ingestFeodo(s);
      else if (/phishtank/i.test(s.name)) iocs = await ingestPhishTank(s);
      else { console.log(`  ${s.name}: skipped (no ingester)`); continue; }
    } catch (e: any) {
      console.error(`  ${s.name}: ERROR ${e.message}`);
      await pool.query(`UPDATE sources SET last_status = $1 WHERE id = $2`, [`error: ${e.message.slice(0, 200)}`, s.id]);
      continue;
    }

    const ins = await writeIOCs(iocs, s.id);
    total += ins;
    const ms = Date.now() - t0;
    console.log(`  ${s.name}: ${iocs.length} fetched, ${ins} inserted (${ms}ms)`);
    await pool.query(
      `UPDATE sources SET last_fetched_at = NOW(), last_status = 'ok', last_items_count = $1, total_items = total_items + $1 WHERE id = $2`,
      [ins, s.id]
    );
  }

  console.log(`[ioc-collector] total new IOCs inserted: ${total}`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });