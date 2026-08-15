// build-graph.ts — graph_edges'i doldurur
// Kaynaklar:
//  1) actors.ttps → actor→technique edges (uses)
//  2) document_actors co-mentions → actor→actor edges (co-mentioned)
//  3) documents.sectors × actors → actor→sector edges (targets)
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[graph] ${m}`);

async function main() {
  // Temizle (idempotent — yeniden çalıştırılabilir)
  await pool.query(`TRUNCATE graph_edges`);
  log('graph_edges temizlendi');

  // 1) Aktör → teknik (uses) — actors.ttps array'inden
  const actorTech = await pool.query<any>(
    `SELECT a.name as actor, t.attack_id as tech, t.name as tech_name
     FROM actors a, unnest(a.ttps) t(attack_id)
     JOIN techniques t2 ON UPPER(t2.attack_id) = UPPER(t.attack_id)
     WHERE a.ttps IS NOT NULL AND array_length(a.ttps, 1) > 0
     LIMIT 6000`
  );
  let n1 = 0;
  for (const r of actorTech.rows) {
    await pool.query(
      `INSERT INTO graph_edges (source_type, source_value, target_type, target_value, relation, confidence)
       VALUES ('actor', $1, 'technique', $2, 'uses', 0.9)
       ON CONFLICT DO NOTHING`,
      [r.actor, r.tech]
    );
    n1++;
  }
  log(`aktör→teknik: ${n1}`);

  // 2) Aktör → aktör (co-mentioned — aynı dokümanda birlikte geçen)
  const coMentions = await pool.query<any>(
    `SELECT t1.actor AS source, t2.actor AS target, COUNT(*)::int as cnt
     FROM documents d
     CROSS JOIN LATERAL unnest(d.actors) t1(actor)
     CROSS JOIN LATERAL unnest(d.actors) t2(actor)
     WHERE d.actors IS NOT NULL AND array_length(d.actors, 1) > 1
       AND LOWER(t1.actor) < LOWER(t2.actor)
     GROUP BY t1.actor, t2.actor ORDER BY cnt DESC LIMIT 2000`
  );
  let n2 = 0;
  for (const r of coMentions.rows) {
    await pool.query(
      `INSERT INTO graph_edges (source_type, source_value, target_type, target_value, relation, confidence)
       VALUES ('actor', $1, 'actor', $2, 'co-mentioned', LEAST(1.0, 0.3 + $3::numeric * 0.15))
       ON CONFLICT DO NOTHING`,
      [r.source, r.target, r.cnt]
    );
    n2++;
  }
  log(`aktör→aktör: ${n2}`);

  // 3) Aktör → sektör (targets — dokümanın sektöründe aktör geçiyorsa)
  const actorSector = await pool.query<any>(
    `SELECT DISTINCT a.actor, s.sector
     FROM documents d, unnest(d.actors) a(actor), unnest(d.sectors) s(sector)
     WHERE d.actors IS NOT NULL AND d.sectors IS NOT NULL
     LIMIT 3000`
  );
  let n3 = 0;
  for (const r of actorSector.rows) {
    await pool.query(
      `INSERT INTO graph_edges (source_type, source_value, target_type, target_value, relation, confidence)
       VALUES ('actor', $1, 'sector', $2, 'targets', 0.6)
       ON CONFLICT DO NOTHING`,
      [r.actor, r.sector]
    );
    n3++;
  }
  log(`aktör→sektör: ${n3}`);

  const total = (await pool.query(`SELECT COUNT(*)::int as c FROM graph_edges`)).rows[0].c;
  log(`TAMAM: toplam ${total} edge`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
