// link-cves.ts — doküman içeriklerinde CVE ID eşleştirme
// CVE-YYYY-NNNNN desenini title+summary+content'ta ara,
// documents.cves array'ine + document_cves junction'a yaz.
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[link-cves] ${m}`);

const CVE_RE = /\bCVE-\d{4}-\d{4,7}\b/gi;

async function main() {
  // 1) Tüm zenginleştirilmiş CVE'lerin ID seti (geçerli olanlar)
  const { rows: enriched } = await pool.query<any>(`SELECT cve_id FROM cve_enrichment`);
  const knownSet = new Set(enriched.map((r: any) => r.cve_id.toUpperCase()));
  log(`${knownSet.size} bilinen CVE (zenginleştirilmiş)`);

  // 2) Dokümanları tara
  const { rows: docs } = await pool.query<any>(
    `SELECT id, title, COALESCE(summary,'') as summary, COALESCE(content,'') as content FROM documents ORDER BY id`
  );
  log(`${docs.length} doküman taranacak`);

  let linked = 0, docCount = 0;
  for (const d of docs) {
    const text = `${d.title || ''} ${d.summary || ''} ${d.content || ''}`;
    const found = new Set<string>();
    for (const m of text.matchAll(CVE_RE)) {
      const id = m[0].toUpperCase();
      if (knownSet.has(id)) found.add(id); // sadece zenginleştirilmiş olanlar
    }
    if (found.size === 0) continue;

    // Mevcut cves array'ini koru + yenileri ekle
    const current = (await pool.query<any>(
      `SELECT cves FROM documents WHERE id=$1`, [d.id]
    )).rows[0]?.cves || [];
    const merged = [...new Set([...current, ...found])];
    await pool.query(`UPDATE documents SET cves=$1 WHERE id=$2`, [merged, d.id]);

    // Junction'a yaz (zenginleştirilmiş CVE'lerle)
    for (const cveId of found) {
      await pool.query(
        `INSERT INTO document_cves (document_id, cve_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [d.id, cveId]
      ).catch(() => {});
      linked++;
    }
    docCount++;
    if (docCount % 300 === 0) log(`${docCount} doküman işlendi...`);
  }

  log(`TAMAM: ${linked} CVE bağlantısı, ${docCount} doküman güncellendi`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
