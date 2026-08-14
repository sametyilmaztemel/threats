// alert-webhook.ts — kritik olay tespiti + webhook bildirimi
// Son koşudan beri: severity>=9 doküman, CVSS>=9 yeni CVE, kritik aktör aktivitesi
// Hedef: ALERT_WEBHOOK_URL (Slack/Telegram webhook) — env'de yoksa sadece loglar
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[alert] ${m}`);

const WEBHOOK = process.env.ALERT_WEBHOOK_URL || '';
const SINCE_MIN = parseInt(process.env.ALERT_SINCE_MIN || '360', 10); // 6 saat (collect interval)

async function main() {
  // 1) Son 6 saatte eklenen kritik dokümanlar
  const { rows: criticalDocs } = await pool.query<any>(
    `SELECT d.id, d.title, d.url, d.severity, s.name as source
     FROM documents d LEFT JOIN sources s ON d.source_id = s.id
     WHERE d.fetched_at > NOW() - ($1 || ' minutes')::interval
       AND d.severity >= 9
     ORDER BY d.fetched_at DESC LIMIT 10`,
    [SINCE_MIN]
  );

  // 2) Son 6 saatte zenginleştirilen CVSS>=9 CVE'ler
  const { rows: criticalCves } = await pool.query<any>(
    `SELECT cve_id, cvss_v3, vendor, product
     FROM cve_enrichment
     WHERE last_enriched_at > NOW() - ($1 || ' minutes')::interval
       AND cvss_v3 >= 9
     ORDER BY cvss_v3 DESC LIMIT 10`,
    [SINCE_MIN]
  );

  // 3) Son 6 saatte eklenen AI tehditler
  const { rows: aiThreats } = await pool.query<any>(
    `SELECT d.id, d.title, at.ai_category, d.severity
     FROM ai_threats at JOIN documents d ON at.document_id = d.id
     WHERE d.fetched_at > NOW() - ($1 || ' minutes')::interval
       AND d.severity >= 8
     ORDER BY d.fetched_at DESC LIMIT 5`,
    [SINCE_MIN]
  );

  const total = criticalDocs.length + criticalCves.length + aiThreats.length;
  log(`kritik: ${criticalDocs.length} doc, ${criticalCves.length} cve, ${aiThreats.length} ai — toplam ${total}`);

  if (total === 0) {
    await pool.end();
    log('kritik olay yok — webhook atlanır');
    return;
  }

  // 4) Mesaj oluştur (Slack-style blocks / düz metin)
  const lines: string[] = [
    `🚨 *THREATS.0RCE.COM — ${total} KRİTİK OLAY* (son ${SINCE_MIN} dk)`,
    '',
  ];
  if (criticalDocs.length) {
    lines.push(`*Kritik Dokümanlar (severity ≥9):*`);
    for (const d of criticalDocs) {
      lines.push(`• [${d.severity}/10] ${d.title} — ${d.source || ''} (${d.id})`);
    }
    lines.push('');
  }
  if (criticalCves.length) {
    lines.push(`*Kritik CVE'ler (CVSS ≥9):*`);
    for (const c of criticalCves) {
      lines.push(`• ${c.cve_id} (CVSS ${c.cvss_v3}) — ${c.vendor || ''} ${c.product || ''}`);
    }
    lines.push('');
  }
  if (aiThreats.length) {
    lines.push(`*AI Tehditler:*`);
    for (const a of aiThreats) {
      lines.push(`• [${a.ai_category}] ${a.title}`);
    }
  }
  lines.push('', `https://threats.0rce.com — TLP:GREEN`);

  const message = lines.join('\n');

  if (!WEBHOOK) {
    log(`ALERT_WEBHOOK_URL tanımsız — mesaj loglanır:\n${message}`);
  } else {
    try {
      const resp = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
      log(`webhook: HTTP ${resp.status}`);
    } catch (e: any) {
      log(`webhook hata: ${e.message}`);
    }
  }

  await pool.end();
  log('TAMAM');
}

main().catch(e => { console.error(e); process.exit(1); });
