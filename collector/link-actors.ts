// link-actors.ts — aliases tabanlı aktör-doküman eşleştirme
// Her aktörün name + aliases'lerini doküman title+summary+content'ta ara,
// documents.actors array'ine + document_actors junction'a yaz.
// Dikkat: kısa/tek heceli alias'lar false positive üretir — min uzunluk 4.
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[link-actors] ${m}`);

// False-positive riskli çok kısa/generik alias'lar
const SKIP_ALIASES = new Set([
  'apt', 'unit', 'group', 'team', 'gang', 'sector', 'hive', 'play',
  'silver', 'gold', 'cobalt', 'magic', 'dark', 'black', 'blue', 'red',
  'snake', 'dragon', 'tiger', 'panda', 'bear', 'kitten', 'falcon',
  'iron', 'steel', 'grizzly', 'cozy', 'fancy',
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  // 1) Tüm aktörler + aliases
  const { rows: actors } = await pool.query<any>(
    `SELECT id, name, COALESCE(aliases, ARRAY[]::text[]) as aliases FROM actors`
  );
  log(`${actors.length} aktör`);

  // 2) Eşleştirme desenleri oluştur
  const patterns: { actorId: number; name: string; regex: RegExp }[] = [];
  for (const a of actors) {
    const names = [a.name, ...(a.aliases || [])];
    const unique = [...new Set(names.map((n: string) => n.trim()).filter((n: string) => n.length >= 4))];
    for (const n of unique) {
      if (SKIP_ALIASES.has(n.toLowerCase())) continue;
      // Kelime sınırlı eşleşme (alt çizgi/boşluk varyantları)
      const esc = escapeRegExp(n);
      patterns.push({ actorId: a.id, name: n, regex: new RegExp(`\\b${esc}\\b`, 'i') });
    }
  }
  log(`${patterns.length} eşleştirme deseni`);

  // 3) Dokümanları tara (content yoksa summary + title)
  const { rows: docs } = await pool.query<any>(
    `SELECT id, title, COALESCE(summary,'') as summary, COALESCE(content,'') as content
     FROM documents ORDER BY id`
  );
  log(`${docs.length} doküman taranacak`);

  let linked = 0, docCount = 0;
  for (const d of docs) {
    const text = `${d.title || ''} ${d.summary || ''} ${d.content || ''}`;
    if (text.length < 30) continue;

    const foundActors = new Map<number, string>(); // actorId → name
    for (const p of patterns) {
      if (p.regex.test(text)) {
        foundActors.set(p.actorId, p.name);
      }
    }
    if (foundActors.size === 0) continue;

    // Mevcut actors array'ini koru + yenileri ekle
    const current = (await pool.query<any>(
      `SELECT actors FROM documents WHERE id=$1`, [d.id]
    )).rows[0]?.actors || [];

    const merged = [...new Set([...current, ...foundActors.values()])];
    await pool.query(`UPDATE documents SET actors=$1 WHERE id=$2`, [merged, d.id]);

    // Junction tablosuna yaz
    for (const actorId of foundActors.keys()) {
      await pool.query(
        `INSERT INTO document_actors (document_id, actor_id, confidence) VALUES ($1, $2, 0.85)
         ON CONFLICT DO NOTHING`,
        [d.id, actorId]
      );
      linked++;
    }
    docCount++;
    if (docCount % 200 === 0) log(`${docCount} doküman işlendi...`);
  }

  // 4) Aktör document_count güncelle
  const { rows: counts } = await pool.query<any>(
    `SELECT actor_id, COUNT(*)::int as cnt FROM document_actors GROUP BY actor_id`
  );
  for (const c of counts) {
    await pool.query(`UPDATE actors SET document_count=$1 WHERE id=$2`, [c.cnt, c.actor_id]);
  }
  log(`document_count güncellendi: ${counts.length} aktör`);

  log(`TAMAM: ${linked} bağlantı, ${docCount} doküman güncellendi`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
