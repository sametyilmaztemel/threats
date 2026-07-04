// cleanup-fp-iocs.ts — Remove false-positive IOC entries from the database.
// Strategy: re-run the same domain filter logic (shared with extract-iocs-from-text.ts)
// over currently stored domain values and delete any that don't pass.

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

// Shared filter constants — keep in sync with extract-iocs-from-text.ts.
// (We could import the extractIOCs function and test each value, but a direct
// filter is simpler and avoids the URL hash collision issue where 'md' might
// also appear in a hash. We only filter domain-type IOCs.)
const FILE_EXTENSIONS = new Set([
  'exe', 'dll', 'sys', 'bat', 'cmd', 'ps1', 'sh', 'py', 'pl', 'rb',
  'ts', 'jsx', 'tsx', 'mjs', 'cjs',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2',
  'iso', 'img', 'vmdk', 'ova',
  'lnk', 'cpl', 'msi', 'msc', 'msp',
  'bin', 'dat', 'war', 'ear', 'jar',
  'log', 'yaml', 'yml', 'csv',
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv',
  'htm', 'css', 'scss', 'sass',
  'aspx', 'jsp',
  'sqlite', 'sqlite3', 'bak',
  'hpp', 'dylib',
  'config', 'conf', 'ini', 'env',
  'lock',
  // Ambiguous TLDs that are more commonly seen as filename extensions in threat intel
  'md', 'json', 'xml', 'yml', 'yaml', 'toml', 'ini', 'cfg',
]);

const VALID_TLDS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int',
  'io', 'co', 'ai', 'app', 'dev', 'xyz', 'info', 'biz',
  'us', 'uk', 'de', 'fr', 'it', 'es', 'nl', 'be', 'at', 'ch', 'pl', 'ru', 'cn', 'jp', 'kr', 'in', 'br', 'mx', 'ca', 'au', 'nz',
  'tv', 'me', 'site', 'online', 'tech', 'store', 'blog', 'cloud', 'live', 'page',
  'top', 'vip', 'win', 'loan', 'click', 'review', 'country', 'science', 'party', 'gq', 'tk', 'cf', 'ml',
  'cyou', 'mom', 'icu', 'rest', 'bond', 'sbs', 'quest', 'cam', 'stream',
  'tk', 'ga', 'cf', 'ml', 'gq',
  'news', 'wiki', 'lol', 'wtf', 'ooo', 'art', 'pro', 'name', 'mobi', 'asia', 'tel',
  'sh', 'rs', 'gg', 'vc', 'bz', 'to', 'im', 'fm', 'am', 'la', 'sx', 'tc', 'pw', 'ws', 'tk', 'ms', 'cc', 'su',
  'nu', 'st', 're', 'tf', 'wf', 'yt', 'pm', 'gl', 'gp', 'mq', 're', 'yt', 'pm', 'nf', 'pn',
  'si', 'hr', 'sk', 'cz', 'ro', 'hu', 'bg', 'gr', 'lt', 'lv', 'ee', 'is', 'fo', 'md', 'ua', 'by',
  'ae', 'sa', 'il', 'tr', 'eg', 'ng', 'ke', 'za', 'ma', 'tn', 'dz', 've', 'ar', 'cl', 'co', 'pe', 'ec',
  'ph', 'my', 'sg', 'hk', 'tw', 'th', 'vn', 'id', 'pk', 'bd', 'lk', 'np', 'mm', 'kh', 'la', 'mn',
  'md', 'cu', 'do', 'jm', 'gt', 'hn', 'ni', 'cr', 'pa', 'cu', 'do',
  'cz', 'sk', 'si', 'hr', 'rs', 'ba', 'mk', 'al', 'me', 'xk',
]);

function looksLikeFilenameOrCode(d: string): boolean {
  const last = d.split('.').pop()!;
  return FILE_EXTENSIONS.has(last.toLowerCase());
}

function hasValidTld(d: string): boolean {
  const last = d.split('.').pop()!.toLowerCase();
  return VALID_TLDS.has(last);
}

function isBadDomain(d: string): boolean {
  if (looksLikeFilenameOrCode(d)) return true;
  if (!hasValidTld(d)) return true;
  if (/^[0-9]+x[0-9]+$/.test(d)) return true;
  if (d.length < 4) return true;
  return false;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Find all domain-type IOCs that fail the filter
  const { rows: bad } = await pool.query<any>(
    `SELECT id, value FROM iocs WHERE type = 'domain'`
  );
  const fpIds: number[] = [];
  for (const r of bad) {
    if (isBadDomain(r.value)) fpIds.push(r.id);
  }
  console.log(`[cleanup] found ${fpIds.length} false-positive domains out of ${bad.length} total`);

  // Sample preview
  if (fpIds.length > 0) {
    const sample = fpIds.slice(0, 10);
    const { rows: sampleRows } = await pool.query(`SELECT id, value FROM iocs WHERE id = ANY($1::int[])`, [sample]);
    console.log('[cleanup] sample FPs:');
    sampleRows.forEach(r => console.log(`  #${r.id}: ${r.value}`));
  }

  // Also drop short URLs that look like fragments
  const { rows: badUrls } = await pool.query<any>(
    `SELECT id, value FROM iocs WHERE type IN ('malicious_url', 'phishing_url') AND length(value) < 15`
  );
  const urlFpIds = badUrls.map(r => r.id);
  console.log(`[cleanup] found ${urlFpIds.length} too-short URLs (length<15)`);

  // Drop associated document_iocs first
  const allIds = [...fpIds, ...urlFpIds];
  if (allIds.length > 0) {
    await pool.query(`DELETE FROM document_iocs WHERE ioc_id = ANY($1::bigint[])`, [allIds]);
    console.log(`[cleanup] deleted document_iocs links`);
    const del = await pool.query(`DELETE FROM iocs WHERE id = ANY($1::bigint[]) RETURNING id`, [allIds]);
    console.log(`[cleanup] deleted ${del.rowCount} IOC rows`);
  } else {
    console.log('[cleanup] nothing to delete');
  }

  // Recompute ioc_count for affected documents
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
  await pool.query(`UPDATE documents SET ioc_count = 0 WHERE ioc_count IS NULL`);
  console.log('[cleanup] recomputed ioc_count');

  // Final stats
  const { rows: stats } = await pool.query(`
    SELECT type, COUNT(*) as cnt FROM iocs GROUP BY type ORDER BY 2 DESC
  `);
  console.log('[cleanup] final IOC stats:');
  stats.forEach(s => console.log(`  ${s.type.padEnd(15)} ${s.cnt}`));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });