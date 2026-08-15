// backfill-daily-stats.ts — geçmişe dönük daily_stats üretir
// daily_stats şeması: day, documents, iocs, cves, actors, techniques, ai_threats, critical_docs, kev_cves
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[backfill-stats] ${m}`);

async function main() {
  // Son 60 gün — her gün için o günün kümülatif durumu
  const { rows } = await pool.query<any>(
    `WITH days AS (
       SELECT generate_series(CURRENT_DATE - 59, CURRENT_DATE, interval '1 day')::date as day
     )
     SELECT d.day,
       (SELECT COUNT(*) FROM documents WHERE fetched_at::date <= d.day) as documents,
       (SELECT COUNT(*) FROM iocs WHERE first_seen::date <= d.day) as iocs,
       (SELECT COUNT(*) FROM cve_enrichment WHERE last_enriched_at::date <= d.day) as cves,
       (SELECT COUNT(*) FROM actors WHERE created_at::date <= d.day) as actors,
       (SELECT COUNT(*) FROM techniques WHERE created_at::date <= d.day) as techniques,
       (SELECT COUNT(*) FROM ai_threats WHERE created_at::date <= d.day) as ai_threats,
       (SELECT COUNT(*) FROM documents WHERE fetched_at::date <= d.day AND severity >= 7) as critical_docs,
       (SELECT COUNT(*) FROM cve_enrichment WHERE last_enriched_at::date <= d.day AND in_kev) as kev_cves
     FROM days d
     ORDER BY d.day`
  );
  log(`${rows.length} gün hesaplandı`);

  let done = 0;
  for (const r of rows) {
    await pool.query(
      `INSERT INTO daily_stats (day, documents, iocs, cves, actors, techniques, ai_threats, critical_docs, kev_cves)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (day) DO UPDATE SET
         documents = EXCLUDED.documents,
         iocs = EXCLUDED.iocs,
         cves = EXCLUDED.cves,
         actors = EXCLUDED.actors,
         techniques = EXCLUDED.techniques,
         ai_threats = EXCLUDED.ai_threats,
         critical_docs = EXCLUDED.critical_docs,
         kev_cves = EXCLUDED.kev_cves`,
      [r.day, r.documents, r.iocs, r.cves, r.actors, r.techniques, r.ai_threats, r.critical_docs, r.kev_cves]
    );
    done++;
  }
  log(`TAMAM: ${done} gün snapshot'landı`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
