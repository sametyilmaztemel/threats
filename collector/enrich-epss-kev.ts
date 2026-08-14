// enrich-epss-kev.ts — EPSS + CISA KEV → cve_enrichment
// FIRST EPSS: bulk API (birden çok CVE tek istek) — 1000 CVE/chunk
// CISA KEV: JSON feed — tam eşleşme (CVE ID)
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[epss-kev] ${m}`);

async function main() {
  // 1) CISA KEV indir
  log('CISA KEV indiriliyor...');
  const kevResp = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', {
    headers: { 'User-Agent': 'threats.0rce.com/1.0' },
  });
  const kev = await kevResp.json();
  const kevSet = new Set<string>();
  for (const v of kev.vulnerabilities || []) {
    if (v.cveID) kevSet.add(v.cveID.toUpperCase());
  }
  log(`KEV: ${kevSet.size} CVE`);

  // 2) KEV'i uygula (hızlı — tüm cve_enrichment)
  const kevRes = await pool.query(`UPDATE cve_enrichment SET in_kev = true WHERE UPPER(cve_id) = ANY($1::text[])`, [[...kevSet]]);
  log(`KEV işaretlendi: ${kevRes.rowCount}`);

  // 3) EPSS — cve_enrichment'taki tüm CVE'ler, bulk chunk (1000/chunk)
  const { rows: cves } = await pool.query<any>(`SELECT cve_id FROM cve_enrichment`);
  log(`${cves.length} CVE için EPSS çekilecek`);

  let updated = 0;
  for (let i = 0; i < cves.length; i += 100) {
    const chunk = cves.slice(i, i + 100).map((c: any) => c.cve_id);
    try {
      const url = `https://api.first.org/data/v1/epss?cve=${chunk.join(',')}`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'threats.0rce.com/1.0' } });
      if (!resp.ok) { log(`EPSS HTTP ${resp.status} — retry 5s`); await new Promise(r => setTimeout(r, 5000)); i -= 500; continue; }
      const data = await resp.json();
      for (const item of data.data || []) {
        const epss = parseFloat(item.epss);
        const pct = parseFloat(item.percentile);
        if (!isNaN(epss)) {
          await pool.query(`UPDATE cve_enrichment SET epss=$1, epss_percentile=$2 WHERE UPPER(cve_id)=$3`, [epss, pct, item.cve.toUpperCase()]);
          updated++;
        }
      }
      log(`${Math.min(i + 100, cves.length)}/${cves.length} (${updated} güncellendi)`);
      await new Promise(r => setTimeout(r, 800)); // ~1.2 req/s
    } catch (e: any) {
      log(`hata: ${e.message} — 10s bekle, retry`);
      await new Promise(r => setTimeout(r, 10000));
      i -= 500;
    }
  }

  log(`TAMAM: ${updated} CVE EPSS'li`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
