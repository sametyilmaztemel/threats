// fetch-fulltext.ts — RSS summary yerine tam makale içeriği çeker
// Hedef: word_count < 200 olan dokümanlar (RSS summary'dan gelenler)
// HTML → text: regex strip (hafif, ek kütüphane yok)
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[fulltext] ${m}`);

const UA = 'threats.0rce.com/1.0 (+https://threats.0rce.com)';
const MAX_DOCS = parseInt(process.env.FULLTEXT_BATCH || '150', 10); // koşu başına max (bounded batch)
const RATE_MS = 500;        // 2 req/s
const TIMEOUT_MS = 15000;

// Kaynakların URL deseni → tam metin alma politikası
// Vendor blogları tam metin verir; bazıları bot koruması koyar (skip)
const SKIP_DOMAINS = [
  'arxiv.org',       // abstract zaten content'te
  'github.com',      // changelog/release notları kısa
  'nvd.nist.gov',    // CVE sayfaları
  'incidentdatabase.ai',
  'openphish.com',
  'urlhaus.abuse.ch',
  'blocklist.de',
  'youtube.com',
  'linkedin.com',
];

function stripHtml(html: string): string {
  // script/style bloklarını at
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  t = t.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  // etiketleri at
  t = t.replace(/<[^>]+>/g, ' ');
  // entity decode — önce numeric (&#NNN; ve &#xHH;), sonra isimli
  t = t.replace(/&#(\d+);/g, (_, n) => {
    try { return String.fromCodePoint(parseInt(n, 10)); } catch { return ''; }
  });
  t = t.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
    try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; }
  });
  t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
       .replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
       .replace(/&mdash;|&ndash;/g, '-').replace(/&hellip;/g, '...')
       .replace(/&ccedil;/gi, 'ç').replace(/&ouml;/gi, 'ö').replace(/&uuml;/gi, 'ü')
       .replace(/&auml;/gi, 'ä').replace(/&uuml;/gi, 'ü').replace(/&ocirc;/gi, 'ô')
       .replace(/&egrave;/gi, 'è').replace(/&agrave;/gi, 'à').replace(/&iuml;/gi, 'ï');
  // boşlukları birleştir
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function extractMain(html: string): string {
  // article/main içeriğine öncelik ver
  const m = html.match(/<article[\s\S]*?<\/article>/i);
  const main = html.match(/<main[\s\S]*?<\/main>/i);
  const body = html.match(/<body[\s\S]*?<\/body>/i);
  const src = (m && m[0]) || (main && main[0]) || (body && body[0]) || html;
  return stripHtml(src);
}

async function fetchWithWayback(url: string): Promise<string | null> {
  // 1) Doğrudan fetch
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (resp.ok) {
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('html')) {
        const html = await resp.text();
        if (html.length >= 500) return html;
      }
    }
  } catch {}
  // 2) Wayback Machine fallback (CDX API ile en son snapshot)
  try {
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&limit=1&filter=statuscode:200&filter=mimetype:text/html&fl=timestamp,original`;
    const cdxResp = await fetch(cdxUrl, { headers: { 'User-Agent': UA } });
    if (!cdxResp.ok) return null;
    const cdx = await cdxResp.json();
    if (!Array.isArray(cdx) || cdx.length < 2) return null;
    const ts = cdx[1][0];
    const orig = cdx[1][1];
    const wbUrl = `https://web.archive.org/web/${ts}id_/${orig}`;
    const ctrl2 = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), TIMEOUT_MS);
    const resp2 = await fetch(wbUrl, { headers: { 'User-Agent': UA }, signal: ctrl2.signal, redirect: 'follow' });
    clearTimeout(timer2);
    if (!resp2.ok) return null;
    const html = await resp2.text();
    if (html.length >= 500) return html;
  } catch {}
  return null;
}

async function main() {
  // Tam metin çekilecek adaylar: kısa içerik + http(s) url + kaynak enabled
  // (30 gün filtresi kaldırıldı — eski dokümanlar da fulltext kazansın)
  const { rows } = await pool.query<any>(
    `SELECT d.id, d.url, d.title, d.summary
     FROM documents d
     JOIN sources s ON d.source_id = s.id
     WHERE s.enabled = true
       AND (d.word_count IS NULL OR d.word_count < 200)
       AND d.url IS NOT NULL AND d.url LIKE 'http%'
     ORDER BY d.fetched_at DESC
     LIMIT ${MAX_DOCS}`
  );
  log(`${rows.length} aday doküman`);

  let fetched = 0, updated = 0, skipped = 0, failed = 0;
  for (const d of rows) {
    let host = '';
    try { host = new URL(d.url).hostname; } catch { skipped++; continue; }
    if (SKIP_DOMAINS.some(sd => host.includes(sd))) { skipped++; continue; }

    try {
      const html = await fetchWithWayback(d.url);
      if (!html) { failed++; continue; }
      const text = extractMain(html);
      const words = text.split(/\s+/).filter(Boolean).length;
      if (words < 50) { skipped++; continue; } // hâlâ kısa — challenge/JS sayfası

      // Summary'dan fazlaysa güncelle (çok daha kısa olanı yazma)
      const summaryWords = (d.summary || '').split(/\s+/).filter(Boolean).length;
      if (words <= summaryWords + 20) { skipped++; continue; }

      await pool.query(
        `UPDATE documents SET content = $1, word_count = $2, fetched_at = NOW() WHERE id = $3`,
        [text, words, d.id]
      );
      updated++;
      fetched++;
      if (fetched % 100 === 0) log(`${fetched} çekildi...`);
    } catch (e: any) {
      if (e.name === 'AbortError') failed++;
      else failed++;
    }
    await new Promise(r => setTimeout(r, RATE_MS));
  }

  log(`TAMAM: ${fetched} çekildi, ${updated} güncellendi, ${skipped} atlandı, ${failed} hata`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
