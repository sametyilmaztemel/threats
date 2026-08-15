// clean-content.ts — mevcut doküman içeriklerini temizler
// 1) HTML entity decode (numeric + isimli)
// 2) Boilerplate strip (site navigasyon metinleri, paylaşım butonları)
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[clean] ${m}`);

function decodeEntities(s: string): string {
  let t = s;
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
       .replace(/&auml;/gi, 'ä').replace(/&ocirc;/gi, 'ô')
       .replace(/&egrave;/gi, 'è').replace(/&agrave;/gi, 'à').replace(/&iuml;/gi, 'ï');
  return t;
}

// Site navigasyonu / boilerplate parçaları (bölünmüş cümleler halinde)
const BOILERPLATES: [RegExp, string][] = [
  [/Whatsapp Telegram Linkedin Email[^.]*\./gi, ''],
  [/"'?haber kaynağınız olarak eklemek için tıklayın!?['"]?\.?/gi, ''],
  [/Çok Okunanlar[\s\S]{0,400}/gi, ''],
  [/^Dünya Gazetesi Dünya /gi, ''],  // başlık tekrarı
  [/^Dünya Gazetesi /gi, ''],
  [/Kaynak: [^\n]{0,60}/gi, ''],
  [/\bWhatsapp\b|\bTelegram\b|\bLinkedin\b|\bEmail\b/gi, ''],
];

function stripBoilerplate(s: string): string {
  let t = s;
  for (const [re, rep] of BOILERPLATES) t = t.replace(re, rep);
  // "Çok Okunanlar" bölümünden sonraki her şeyi kes (liste başlıkları başlar)
  const idx = t.search(/Çok Okunanlar/i);
  if (idx > 0) t = t.slice(0, idx);
  // Fazla boşlukları temizle
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

async function main() {
  // Entity'li veya boilerplate'li dokümanları bul
  const { rows } = await pool.query<any>(
    `SELECT id, title, summary, content FROM documents
     WHERE content LIKE '%&#%' OR summary LIKE '%&#%'
        OR content LIKE '%Okunanlar%' OR content LIKE '%tıklayın%'
        OR content LIKE '%Whatsapp%' OR content LIKE '%Dünya Gazetesi Dünya%'
        OR summary LIKE '%Okunanlar%' OR summary LIKE '%Whatsapp%'`
  );
  log(`${rows.length} kirli doküman bulundu`);

  let fixed = 0;
  for (const d of rows) {
    let changed = false;
    let content = d.content || '';
    let summary = d.summary || '';
    let title = d.title || '';

    if (content.includes('&#')) { content = decodeEntities(content); changed = true; }
    if (summary.includes('&#')) { summary = decodeEntities(summary); changed = true; }
    if (title.includes('&#')) { title = decodeEntities(title); changed = true; }

    const cleanContent = stripBoilerplate(content);
    if (cleanContent !== content) { content = cleanContent; changed = true; }
    const cleanSummary = stripBoilerplate(summary);
    if (cleanSummary !== summary) { summary = cleanSummary; changed = true; }

    if (changed) {
      const words = content ? content.split(/\s+/).filter(Boolean).length : (d.content || '').split(/\s+/).filter(Boolean).length;
      await pool.query(
        `UPDATE documents SET title=$1, summary=$2, content=$3, word_count=$4 WHERE id=$5`,
        [title, summary, content, words, d.id]
      );
      fixed++;
    }
    if (fixed % 100 === 0 && fixed > 0) log(`${fixed} temizlendi...`);
  }

  log(`TAMAM: ${fixed} doküman temizlendi`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
