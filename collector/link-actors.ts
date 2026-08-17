// link-actors.ts — canonical threat-actor matching using actor-match.ts.
// Word-boundary + phrasal + normalize, generic short aliases excluded.
// Writes documents.actors (canonical names only) + document_actors junction
// with confidence/match_reason/matched_text/extraction_method.
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { findActorMatches, type ActorDef } from './actor-match';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[link-actors] ${m}`);

async function main() {
  // 1) Tüm aktörler + canonical aliases
  const { rows: actors } = await pool.query<any>(
    `SELECT id, name, COALESCE(aliases, ARRAY[]::text[]) as aliases FROM actors WHERE name IS NOT NULL`
  );
  log(`${actors.length} aktör`);
  const actorDefs: ActorDef[] = actors
    .filter((a: any) => a.name && a.aliases && a.aliases.length > 0)
    .map((a: any) => ({ name: a.name, aliases: a.aliases as string[] }));

  // 2) Dokümanları tara
  const { rows: docs } = await pool.query<any>(
    `SELECT id, title, COALESCE(summary,'') as summary, COALESCE(content,'') as content FROM documents ORDER BY id`
  );
  log(`${docs.length} doküman taranacak`);

  let linked = 0, docCount = 0;
  for (const d of docs) {
    const text = `${d.title || ''} ${d.summary || ''} ${d.content || ''}`;
    if (text.length < 30) continue;
    const matches = findActorMatches(text, actorDefs);
    if (!matches.length) continue;

    // documents.actors array'ine sadece canonical name'leri ekle
    const canonicalByActor = new Map<number, string>();
    for (const m of matches) {
      const actorRow = await pool.query<any>(`SELECT id FROM actors WHERE name=$1`, [m.actorName]);
      if (actorRow.rows[0]) canonicalByActor.set(actorRow.rows[0].id, m.actorName);
    }
    const newActors = [...canonicalByActor.values()];
    const current = (await pool.query<any>(`SELECT actors FROM documents WHERE id=$1`, [d.id])).rows[0]?.actors || [];
    const merged = [...new Set([...current, ...newActors])];
    await pool.query(`UPDATE documents SET actors=$1 WHERE id=$2`, [merged, d.id]);

    for (const m of matches) {
      const actorRow = await pool.query<any>(`SELECT id FROM actors WHERE name=$1`, [m.actorName]);
      if (!actorRow.rows[0]) continue;
      await pool.query(
        `INSERT INTO document_actors (document_id, actor_id, confidence, match_reason, matched_text, extraction_method)
         VALUES ($1, $2, $3, $4, $5, 'canonical_alias_match')
         ON CONFLICT (document_id, actor_id) DO UPDATE SET
           confidence = EXCLUDED.confidence,
           match_reason = EXCLUDED.match_reason,
           matched_text = EXCLUDED.matched_text`,
        [d.id, actorRow.rows[0].id, Math.round(m.confidence * 100), m.matchReason, m.matchedText]
      );
      linked++;
    }
    docCount++;
    if (docCount % 500 === 0) log(`${docCount} doküman işlendi...`);
  }

  // 3) document_count güncelle
  const { rows: counts } = await pool.query<any>(
    `SELECT actor_id, COUNT(*)::int as cnt FROM document_actors GROUP BY actor_id`
  );
  for (const c of counts) {
    await pool.query(`UPDATE actors SET document_count=$1 WHERE id=$2`, [c.cnt, c.actor_id]);
  }
  log(`document_count güncellendi: ${counts.length} aktör`);

  log(`TAMAM: ${linked} aliases bağlantı, ${docCount} doküman`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
