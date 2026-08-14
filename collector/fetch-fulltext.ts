// fetch-fulltext.ts — RSS summary yerine tam makale içeriği çeker
// Hedef: word_count < 200 olan dokümanlar (RSS summary'dan gelenler)
// HTML → text: regex strip (hafif, ek kütüphane yok)
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[fulltext] ${m}`);

const UA = 'threats.0rce.com/1.0 (+https://threats.0rce.com)';
const MAX_DOCS = 3000;      // koşu başına max
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
  // entity decode
  t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
       .replace(/&rsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;|&ndash;/g, '-');
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
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const resp = await fetch(d.url, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      clearTimeout(timer);
      if (!resp.ok) { failed++; continue; }
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('html')) { skipped++; continue; } // PDF vs. atla

      const html = await resp.text();
      if (html.length < 500) { skipped++; continue; } // boş/challenge sayfası
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
