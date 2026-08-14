// generate-report.ts — günlük/haftalık otomatik PDF rapor üretimi + arşiv kaydı
// Worker collect.sh'ten çağrılır; PDF'i backups/reports/ altına yazar, DB'ye kaydeder.
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[report] ${m}`);

const OUT_DIR = process.env.REPORT_DIR || '/app/reports';
const PERIOD = process.env.REPORT_PERIOD || 'daily'; // daily | weekly

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1) Veriler
  const stats = (await pool.query(`SELECT
    (SELECT COUNT(*) FROM documents) as total_documents,
    (SELECT COUNT(*) FROM iocs) as total_iocs,
    (SELECT COUNT(*) FROM documents WHERE ai_threat) as ai_threats,
    (SELECT COUNT(*) FROM sources WHERE enabled) as active_sources,
    (SELECT COUNT(*) FROM cve_enrichment WHERE cvss_v3 >= 9) as critical_cves,
    (SELECT COUNT(*) FROM actors) as total_actors
  `)).rows[0];

  const days = PERIOD === 'weekly' ? 7 : 1;
  const periodDocs = (await pool.query(
    `SELECT COUNT(*)::int as n, COUNT(*) FILTER (WHERE severity >= 8)::int as crit
     FROM documents WHERE fetched_at > NOW() - ($1 || ' days')::interval`, [days]
  )).rows[0];

  const topActors = (await pool.query(
    `SELECT a.name, COUNT(*)::int as cnt FROM documents d, unnest(d.actors) a
     WHERE d.fetched_at > NOW() - ($1 || ' days')::interval
     GROUP BY a.name ORDER BY cnt DESC LIMIT 5`, [days]
  )).rows;

  const topCves = (await pool.query(
    `SELECT cve_id, cvss_v3 FROM cve_enrichment WHERE cvss_v3 >= 9
     ORDER BY cvss_v3 DESC LIMIT 5`
  )).rows;

  const sectors = (await pool.query(
    `SELECT sector, COUNT(*)::int as n FROM documents d, unnest(d.sectors) sector
     WHERE d.fetched_at > NOW() - ($1 || ' days')::interval
     GROUP BY sector ORDER BY n DESC LIMIT 5`, [days]
  )).rows;

  // 2) PDF üret
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const fname = `threats-${PERIOD}-${dateStr}.pdf`;
  const fpath = path.join(OUT_DIR, fname);

  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 48, right: 48 } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on('end', resolve));

  doc.fontSize(8).fillColor('#666').text(`THREATS.0RCE.COM — ${PERIOD.toUpperCase()} INTELLIGENCE REPORT`, { align: 'left' });
  doc.fillColor('#666').text(`${dateStr} · TLP:GREEN`, { align: 'right' });
  doc.moveDown(1.5);
  doc.fontSize(20).fillColor('#000').text('0RCE Threat Intelligence', { align: 'center' });
  doc.fontSize(11).fillColor('#333').text(`${PERIOD.toUpperCase()} REPORT — ${dateStr}`, { align: 'center' });
  doc.moveDown(1.2);

  doc.fontSize(10).fillColor('#000').text('Executive Summary', { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor('#333')
    .text(`Total corpus: ${stats.total_documents} documents, ${stats.total_iocs} IOCs, ${stats.ai_threats} AI threats. `)
    .text(`This period: ${periodDocs.n} new documents (${periodDocs.crit} critical). `)
    .text(`${stats.critical_cves} critical CVEs (CVSS≥9) enriched. ${stats.total_actors} threat actors tracked.`);
  doc.moveDown(1.2);

  if (topActors.length) {
    doc.fontSize(10).fillColor('#000').text(`Top Actors (${days}d)`, { underline: true });
    doc.moveDown(0.3);
    topActors.forEach((a: any) => doc.fontSize(9).fillColor('#333').text(`${a.name.padEnd(24)} ${a.cnt} mentions`));
    doc.moveDown(1.2);
  }
  if (topCves.length) {
    doc.fontSize(10).fillColor('#000').text('Critical CVEs', { underline: true });
    doc.moveDown(0.3);
    topCves.forEach((c: any) => doc.fontSize(9).fillColor('#333').text(`${c.cve_id.padEnd(16)} CVSS ${c.cvss_v3}`));
    doc.moveDown(1.2);
  }
  if (sectors.length) {
    doc.fontSize(10).fillColor('#000').text('Sector Activity', { underline: true });
    doc.moveDown(0.3);
    sectors.forEach((s: any) => doc.fontSize(9).fillColor('#333').text(`${String(s.sector).toUpperCase().padEnd(14)} ${s.n} docs`));
    doc.moveDown(1.2);
  }

  doc.fontSize(7).fillColor('#999').text('All data aggregated from public sources. TLP:GREEN.', { align: 'center' });
  doc.end();
  await done;

  fs.writeFileSync(fpath, Buffer.concat(chunks));
  log(`PDF yazıldı: ${fpath} (${fs.statSync(fpath).size} bytes)`);

  // 3) DB arşiv kaydı
  await pool.query(
    `CREATE TABLE IF NOT EXISTS reports (
       id SERIAL PRIMARY KEY,
       period TEXT NOT NULL,
       report_date DATE NOT NULL,
       filename TEXT NOT NULL,
       total_documents INTEGER, total_iocs INTEGER, ai_threats INTEGER,
       period_new_docs INTEGER, period_critical INTEGER,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       UNIQUE (period, report_date)
     )`
  );
  await pool.query(
    `INSERT INTO reports (period, report_date, filename, total_documents, total_iocs, ai_threats, period_new_docs, period_critical)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (period, report_date) DO UPDATE SET
       total_documents=EXCLUDED.total_documents, total_iocs=EXCLUDED.total_iocs,
       ai_threats=EXCLUDED.ai_threats, period_new_docs=EXCLUDED.period_new_docs,
       period_critical=EXCLUDED.period_critical`,
    [PERIOD, dateStr, fname, stats.total_documents, stats.total_iocs, stats.ai_threats, periodDocs.n, periodDocs.crit]
  );
  log(`DB kaydı: ${PERIOD}/${dateStr}`);

  await pool.end();
  log('TAMAM');
}

main().catch(e => { console.error(e); process.exit(1); });
