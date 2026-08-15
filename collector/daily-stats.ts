// daily-stats.ts — günlük veri anlık görüntüsü (trend analizi için)
// Her gün çalışır; aynı gün için upsert (idempotent)
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[daily-stats] ${m}`);

async function main() {
  const { rows } = await pool.query<any>(
    `INSERT INTO daily_stats (day, documents, iocs, cves, actors, techniques, ai_threats, critical_docs, kev_cves)
     SELECT
       CURRENT_DATE,
       (SELECT COUNT(*) FROM documents),
       (SELECT COUNT(*) FROM iocs),
       (SELECT COUNT(*) FROM cve_enrichment),
       (SELECT COUNT(*) FROM actors),
       (SELECT COUNT(*) FROM techniques),
       (SELECT COUNT(*) FROM ai_threats),
       (SELECT COUNT(*) FROM documents WHERE severity >= 8),
       (SELECT COUNT(*) FROM cve_enrichment WHERE in_kev)
     ON CONFLICT (day) DO UPDATE SET
       documents = EXCLUDED.documents,
       iocs = EXCLUDED.iocs,
       cves = EXCLUDED.cves,
       actors = EXCLUDED.actors,
       techniques = EXCLUDED.techniques,
       ai_threats = EXCLUDED.ai_threats,
       critical_docs = EXCLUDED.critical_docs,
       kev_cves = EXCLUDED.kev_cves,
       created_at = NOW()
     RETURNING day`
  );
  log(`snapshot: ${rows[0]?.day} kaydedildi`);
  await pool.end();
  log('TAMAM');
}

main().catch(e => { console.error(e); process.exit(1); });
