// quality-score.ts — doküman kalite skoru (0-100)
// word_count + entity zenginliği + kaynak tier'ından deterministik hesaplama
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[quality] ${m}`);

async function main() {
  // quality_score kolonu yoksa ekle
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0`);

  const { rows } = await pool.query<any>(
    `SELECT d.id,
            COALESCE(d.word_count, 0) as wc,
            COALESCE(array_length(d.actors, 1), 0) as actors_n,
            COALESCE(array_length(d.cves, 1), 0) as cves_n,
            COALESCE(array_length(d.techniques, 1), 0) as techs_n,
            COALESCE(array_length(d.sectors, 1), 0) as sectors_n,
            d.ai_threat,
            d.kill_chain_phase,
            d.ioc_count,
            s.tier
     FROM documents d
     LEFT JOIN sources s ON d.source_id = s.id`
  );

  let updated = 0;
  for (const d of rows) {
    let score = 10;

    // word_count: 0-50 = 0, 50-200 = 20, 200-500 = 40, 500+ = 50
    if (d.wc >= 500) score += 50;
    else if (d.wc >= 200) score += 40;
    else if (d.wc >= 50) score += 20;

    // Entity zenginliği (max +30)
    const entities = (d.actors_n || 0) + (d.cves_n || 0) + (d.techs_n || 0) + (d.sectors_n || 0) + (d.ioc_count || 0);
    score += Math.min(30, entities);

    // Kill chain + AI (max +10)
    if (d.kill_chain_phase) score += 5;
    if (d.ai_threat) score += 5;

    // Kaynak tier güvenilirliği (max +10): T1=10, T2=7, T3=4
    const tier = String(d.tier || '?');
    if (tier === '1') score += 10;
    else if (tier === '2') score += 7;
    else if (tier === '3') score += 4;

    score = Math.min(100, score);
    await pool.query(`UPDATE documents SET quality_score = $1 WHERE id = $2`, [score, d.id]);
    updated++;
  }

  log(`TAMAM: ${updated} doküman kalite skoru aldı`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
