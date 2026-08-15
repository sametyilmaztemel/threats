// email-newsletter.ts — haftalık özet e-posta bülteni
// Gereksinimler: SMTP_HOST/PORT/USER/PASS + NEWSLETTER_TO env'leri
// Yoksa bülten atlanır (loglanır). collect.sh'te haftalık tetiklenir.
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[newsletter] ${m}`);

async function main() {
  // Haftalık mı kontrol (Pazar günleri çalışır)
  const today = new Date();
  const isSunday = today.getUTCDay() === 0;
  const force = process.env.NEWSLETTER_FORCE === '1';

  if (!isSunday && !force) {
    log('Pazar değil — bülten atlandı');
    await pool.end();
    return;
  }

  const SMTP_HOST = process.env.SMTP_HOST || '';
  const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
  const SMTP_USER = process.env.SMTP_USER || '';
  const SMTP_PASS = process.env.SMTP_PASS || '';
  const TO = process.env.NEWSLETTER_TO || '';
  const FROM = process.env.SMTP_FROM || SMTP_USER;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !TO) {
    log('SMTP env tanımsız — bülten atlandı (.env.example\'a ekle)');
    await pool.end();
    return;
  }

  // Haftalık veriler
  const stats = (await pool.query(`SELECT
    (SELECT COUNT(*) FROM documents WHERE fetched_at > NOW() - interval '7 days') as new_docs,
    (SELECT COUNT(*) FROM documents WHERE fetched_at > NOW() - interval '7 days' AND severity >= 8) as critical,
    (SELECT COUNT(*) FROM iocs WHERE created_at > NOW() - interval '7 days') as new_iocs,
    (SELECT COUNT(*) FROM cve_enrichment WHERE in_kev) as kev_total
  `)).rows[0];

  const topActors = (await pool.query(
    `SELECT a, COUNT(*)::int as n FROM documents d, unnest(d.actors) a
     WHERE d.fetched_at > NOW() - interval '7 days'
     GROUP BY a ORDER BY n DESC LIMIT 5`
  )).rows;

  const topCves = (await pool.query(
    `SELECT cve_id, cvss_v3 FROM cve_enrichment WHERE in_kev AND cvss_v3 >= 9
     ORDER BY cvss_v3 DESC LIMIT 5`
  )).rows;

  // HTML e-posta
  const rows = (rowsArr: any[]) => rowsArr.map((r: any, i: number) =>
    `<tr style="border-bottom:1px solid #eee"><td style="padding:6px 0;color:#333">${i + 1}. ${r.a || r.cve_id}</td><td style="padding:6px 0;text-align:right;color:#999">${r.n || r.cvss_v3}</td></tr>`
  ).join('');

  const html = `<!DOCTYPE html><html><body style="font-family:monospace;max-width:600px;margin:0 auto;padding:20px;color:#111">
<h1 style="font-size:18px;font-weight:normal">THREATS.0RCE.COM — HAFTALIK ÖZET</h1>
<p style="color:#666;font-size:12px">${today.toISOString().slice(0, 10)} · TLP:GREEN</p>
<hr style="border:none;border-top:1px solid #ccc">
<h2 style="font-size:14px;font-weight:normal">📊 SAYILAR</h2>
<table style="width:100%;font-size:13px">
<tr><td style="padding:4px 0">Yeni doküman</td><td style="text-align:right">${stats.new_docs}</td></tr>
<tr><td style="padding:4px 0">Kritik (sev≥8)</td><td style="text-align:right">${stats.critical}</td></tr>
<tr><td style="padding:4px 0">Yeni IOC</td><td style="text-align:right">${stats.new_iocs}</td></tr>
<tr><td style="padding:4px 0">KEV'deki CVE (toplam)</td><td style="text-align:right">${stats.kev_total}</td></tr>
</table>
<h2 style="font-size:14px;font-weight:normal">🎭 AKTİF AKTÖRLER</h2>
<table style="width:100%;font-size:13px">${rows(topActors)}</table>
<h2 style="font-size:14px;font-weight:normal">🚨 KRİTİK CVE'LER (KEV)</h2>
<table style="width:100%;font-size:13px">${rows(topCves)}</table>
<hr style="border:none;border-top:1px solid #ccc">
<p style="font-size:11px;color:#999">https://threats.0rce.com · Günlük rapor: /reports · TLP:GREEN</p>
</body></html>`;

  // SMTP gönderimi (nodemailer — app/node_modules'da)
  let transporter;
  try {
    const nodemailer = await import('nodemailer');
    transporter = nodemailer.default.createTransport({
      host: SMTP_HOST, port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    const info = await transporter.sendMail({
      from: FROM, to: TO,
      subject: `Threats Haftalık Özet ${today.toISOString().slice(0, 10)}`,
      html,
    });
    log(`e-posta gönderildi: ${info.messageId}`);
  } catch (e: any) {
    log(`e-posta hata: ${e.message}`);
  }

  await pool.end();
  log('TAMAM');
}

main().catch(e => { console.error(e); process.exit(1); });
