// extract-iocs-from-text.ts — IOC extraction helpers shared by collect-rss.mts and backfill.
// Exports extractIOCs(text) → Array<{value, type, classification, confidence, reason}>.
//
// Madde 5: Public infrastructure domains (github.com, microsoft.com, ...) are
// NEVER classified as malicious IOC. They get classification: 'mentioned'
// and very low confidence. IOC pipeline must filter out 'mentioned' rows
// before counting/documenting.

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
  if (p[0] >= 224) return true;
  return false;
}

// Version-number heuristic: an IPv4-shaped value that appears near a "version" keyword
// in the surrounding text is treated as a software version, not an IOC.
function isVersionContext(ip: string, text: string): boolean {
  const escaped = ip.replace(/\./g, '\\.');
  const versionPattern = new RegExp(
    `(version|v|build|release|kernel|spec|^)\\s*[:=]?\\s*${escaped}|${escaped}\\s*(version|release|build|kernel|spec)`,
    'i'
  );
  return versionPattern.test(text);
}

// Known file/code TLD-like suffixes that are NOT real domains when matched as the last label
// NOTE: must not overlap with VALID_TLDS below — those double as real TLDs.
// Heuristic: any TLD that is *also* a popular filename/code extension is treated as code.
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

// Valid TLDs — keep this conservative. Anything else in the last label is suspicious.
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
  if (looksLikeFilenameOrCode(d)) return true;       // cmd.exe, fondue.exe, bcrypt.dll, etc.
  if (!hasValidTld(d)) return true;                  // node.js, http.sys, console.log, json.stringify, etc.
  if (/^[0-9]+x[0-9]+$/.test(d)) return true;        // 1920x1080
  return false;
}

export interface ExtractedIOC { value: string; type: string; classification: string; confidence: number; reason?: string; }

// Public infrastructure domains (Madde 5) — never classified as malicious IOC
// Re-export from ioc-classifier so extract-iocs-from-text stays aligned.
import { classifyIoc, isPublicInfrastructure } from './ioc-classifier';

export function extractIOCs(text: string): ExtractedIOC[] {
  if (!text) return [];
  const out: ExtractedIOC[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(REGEX.url)) {
    const v = m[0].replace(/[.,;:!?)]+$/g, '').trim();
    if (v.length < 10 || v.length > 2000) continue;
    const k = `malicious_url|${v}`;
    if (seen.has(k)) continue;
    seen.add(k);
    // Madde 5: public infrastructure is always 'mentioned'
    const classified = classifyIoc(v, 'malicious_url', { hasSourceLink: false, hasMaliciousKeyword: false });
    out.push({ value: v, type: 'malicious_url', classification: classified.classification, confidence: classified.confidence, reason: classified.reason });
  }

  for (const m of text.matchAll(REGEX.ipv4)) {
    if (isIPv4Private(m[0])) continue;
    if (isVersionContext(m[0], text)) continue;
    const k = `c2_ip|${m[0]}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: m[0], type: 'c2_ip', classification: 'observed', confidence: 0.5 });
  }

  for (const m of text.matchAll(REGEX.sha256)) {
    const k = `sha256|${m[0].toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: m[0].toLowerCase(), type: 'sha256', classification: 'observed', confidence: 0.5 });
  }

  for (const m of text.matchAll(REGEX.sha1)) {
    if (seen.has(`sha256|${m[0].toLowerCase()}`)) continue;
    const k = `sha1|${m[0].toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: m[0].toLowerCase(), type: 'sha1', classification: 'observed', confidence: 0.5 });
  }

  for (const m of text.matchAll(REGEX.md5)) {
    if (seen.has(`sha1|${m[0].toLowerCase()}`)) continue;
    if (seen.has(`sha256|${m[0].toLowerCase()}`)) continue;
    const k = `md5|${m[0].toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: m[0].toLowerCase(), type: 'md5', classification: 'observed', confidence: 0.5 });
  }

  for (const m of text.matchAll(DOMAIN_REGEX)) {
    const d = m[0].toLowerCase();
    if (isBadDomain(d)) continue;
    if (d.length < 4 || d.length > 253) continue;
    if (/^\d+\.\d+$/.test(d)) continue;
    // Madde 5: public infrastructure domain → always 'mentioned', never IOC
    if (isPublicInfrastructure(d)) continue;
    const k = `domain|${d}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: d, type: 'domain', classification: 'observed', confidence: 0.5 });
  }

  return out;
}