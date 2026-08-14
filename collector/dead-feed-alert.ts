// dead-feed-alert.ts — ölü kaynak tespiti
// source_history'dan son 3 çekim: 3'ü de error/0-item ise → disable + alert
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[dead-feed] ${m}`);

const THRESHOLD = 3;
const WEBHOOK = process.env.ALERT_WEBHOOK_URL || '';

async function main() {
  const { rows } = await pool.query<any>(
    `SELECT s.id, s.name, s.url, s.last_status,
            (SELECT COUNT(*) FROM source_history sh
             WHERE sh.source_id = s.id
               AND (sh.status != 'ok' OR sh.items_count = 0)) as bad_count,
            (SELECT COUNT(*) FROM source_history sh
             WHERE sh.source_id = s.id) as total_checks
     FROM sources s WHERE enabled = true`
  );

  let disabled = 0;
  const disabledNames: string[] = [];
  for (const src of rows) {
    // En az THRESHOLD kontrol varsa ve son THRESHOLD'ün hepsi kötüyse
    const { rows: recent } = await pool.query<any>(
      `SELECT status, items_count FROM source_history
       WHERE source_id = $1 ORDER BY fetched_at DESC LIMIT $2`,
      [src.id, THRESHOLD]
    );
    if (recent.length < THRESHOLD) continue; // yeterli veri yok
    const allBad = recent.every((r: any) => r.status !== 'ok' || r.items_count === 0);
    if (allBad) {
      await pool.query(`UPDATE sources SET enabled = false WHERE id = $1`, [src.id]);
      log(`DISABLE: ${src.name} — son ${THRESHOLD} çekim başarısız (${recent.map((r: any) => r.items_count).join(',')})`);
      disabled++;
      disabledNames.push(src.name);
    }
  }

  // Alert webhook
  if (disabled > 0) {
    const msg = `⚠️ *threats.0rce.com — ${disabled} ölü kaynak disable edildi*\n${disabledNames.map(n => `• ${n}`).join('\n')}`;
    if (WEBHOOK) {
      try {
        const resp = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: msg }) });
        log(`webhook: HTTP ${resp.status}`);
      } catch (e: any) { log(`webhook hata: ${e.message}`); }
    } else {
      log(`ALERT (webhook yok): ${msg}`);
    }
  }

  log(`TAMAM: ${disabled} kaynak disable edildi`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
