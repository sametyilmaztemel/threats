// extract-iocs-from-text.ts — IOC extraction helpers shared by collect-rss.mts and backfill.
// Exports extractIOCs(text) → Array<{value, type}>.

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

function isBadDomain(d: string): boolean {
  if (/^[0-9]+x[0-9]+$/.test(d)) return true;
  return false;
}

export interface ExtractedIOC { value: string; type: string; }

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
    out.push({ value: v, type: 'malicious_url' });
  }

  for (const m of text.matchAll(REGEX.ipv4)) {
    if (isIPv4Private(m[0])) continue;
    const k = `c2_ip|${m[0]}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: m[0], type: 'c2_ip' });
  }

  for (const m of text.matchAll(REGEX.sha256)) {
    const k = `sha256|${m[0].toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: m[0].toLowerCase(), type: 'sha256' });
  }

  for (const m of text.matchAll(REGEX.sha1)) {
    if (seen.has(`sha256|${m[0].toLowerCase()}`)) continue;
    const k = `sha1|${m[0].toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: m[0].toLowerCase(), type: 'sha1' });
  }

  for (const m of text.matchAll(REGEX.md5)) {
    if (seen.has(`sha1|${m[0].toLowerCase()}`)) continue;
    if (seen.has(`sha256|${m[0].toLowerCase()}`)) continue;
    const k = `md5|${m[0].toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: m[0].toLowerCase(), type: 'md5' });
  }

  for (const m of text.matchAll(DOMAIN_REGEX)) {
    const d = m[0].toLowerCase();
    if (isBadDomain(d)) continue;
    if (d.length < 4 || d.length > 253) continue;
    if (/^\d+\.\d+$/.test(d)) continue;
    const k = `domain|${d}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value: d, type: 'domain' });
  }

  return out;
}