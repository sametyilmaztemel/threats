// sync-cves.ts — NVD 2.0 API'den devasa CVE kütüphanesi çeker
// 2022-01-01'den bugüne: ~200K CVE, resultsPerPage=2000, 5 req/30s kuralına uyar
// Upsert: yeni CVE'ler eklenir, mevcutların cvss/vendor/product/desc güncellenir
// EPSS + in_kev korunur (enrich-epss-kev.ts ayrı koşar)
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const log = (m: string) => console.log(`[cve-sync] ${m}`);

const API = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const UA = 'threats.0rce.com/1.0 (+https://threats.0rce.com)';
const PAGE_SIZE = 2000;
const RATE_MS = 6500; // 5 req/30s → 6.5s/isık güvenli

// Yalnızca delta mı? (son 24 saat — worker otomasyonu)
const DELTA_HOURS = parseInt(process.env.CVE_DELTA_HOURS || '0', 10);

function extractCvss(v: any): number | null {
  const m = v?.metrics || {};
  for (const key of ['cvssMetricV31', 'cvssMetricV30', 'cvssMetricV40']) {
    const arr = m[key];
    if (arr && arr.length > 0 && arr[0].cvssData?.baseScore != null) {
      return Number(arr[0].cvssData.baseScore);
    }
  }
  return null;
}

function extractVendorProduct(v: any): { vendor: string | null; product: string | null } {
  const cpes: any[] = v?.configurations?.[0]?.nodes?.flatMap((n: any) => n.cpeMatch || []) || [];
  const first = cpes.find((c: any) => c.vulnerable && c.criteria) || cpes[0];
  if (!first?.criteria) return { vendor: null, product: null };
  // cpe:2.3:part:vendor:product:version:...
  const parts = first.criteria.split(':');
  return { vendor: parts[3] || null, product: parts[4] || null };
}

async function main() {
  // NVD API kısıtı: pubStartDate→pubEndDate aralığı max 120 gün (404 döner)
  // Çözüm: 120 günlük pencerelerle kaydırmalı çekim (2022-01-01 → bugün)
  const WINDOW_DAYS = 100; // güvenli marj (429 riskini azaltır)
  let start = new Date('2022-01-01T00:00:00.000');
  if (DELTA_HOURS > 0) {
    start = new Date(Date.now() - DELTA_HOURS * 3600_000);
  }

  let inserted = 0, updated = 0, totalFetched = 0;
  let windowNum = 0;

  while (start < new Date()) {
    const windowEnd = new Date(Math.min(start.getTime() + WINDOW_DAYS * 86400_000, Date.now()));
    const startParam = start.toISOString().replace(/\.\d{3}Z$/, '.000');
    const endParam = windowEnd.toISOString().replace(/\.\d{3}Z$/, '.000');
    windowNum++;
    log(`pencere ${windowNum}: ${startParam.slice(0,10)} → ${endParam.slice(0,10)}`);

    let page = 0;
    while (true) {
      const url = `${API}?pubStartDate=${encodeURIComponent(startParam)}&pubEndDate=${encodeURIComponent(endParam)}&resultsPerPage=${PAGE_SIZE}&startIndex=${page * PAGE_SIZE}`;
      let resp;
      try {
        resp = await fetch(url, { headers: { 'User-Agent': UA } });
      } catch (e: any) {
        log(`ağ hatası: ${e.message} — 15s bekle, retry`);
        await new Promise(r => setTimeout(r, 15000));
        continue;
      }
      if (resp.status === 403 || resp.status === 429) {
        log(`NVD ${resp.status} — 30s bekle, retry`);
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }
      if (!resp.ok) {
        log(`NVD ${resp.status} — 15s bekle, retry`);
        await new Promise(r => setTimeout(r, 15000));
        continue;
      }

      const data = await resp.json();
      const vulns = data.vulnerabilities || [];
      const total = data.totalResults || 0;
      totalFetched += vulns.length;

      for (const item of vulns) {
        const v = item.cve;
        const cvss = extractCvss(v);
        const { vendor, product } = extractVendorProduct(v);
        const desc = v.descriptions?.find((d: any) => d.lang === 'en')?.value || null;
        const published = v.published ? v.published.slice(0, 10) : null;

        const ins = await pool.query(
          `INSERT INTO cve_enrichment (cve_id, cvss_v3, vendor, product, description, published_date, last_enriched_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (cve_id) DO UPDATE SET
             cvss_v3 = COALESCE(EXCLUDED.cvss_v3, cve_enrichment.cvss_v3),
             vendor = COALESCE(EXCLUDED.vendor, cve_enrichment.vendor),
             product = COALESCE(EXCLUDED.product, cve_enrichment.product),
             description = COALESCE(EXCLUDED.description, cve_enrichment.description),
             published_date = COALESCE(EXCLUDED.published_date, cve_enrichment.published_date),
             last_enriched_at = NOW()
           RETURNING (xmax = 0) AS is_insert`,
          [v.id.toUpperCase(), cvss, vendor, product, desc, published]
        );
        if (ins.rows[0]?.is_insert) inserted++;
        else updated++;
      }

      page++;
      log(`  sayfa ${page}: ${totalFetched} toplam (eklenen: ${inserted}, güncellenen: ${updated})`);

      if (page * PAGE_SIZE >= total || vulns.length === 0) break;
      await new Promise(r => setTimeout(r, RATE_MS));
    }

    start = windowEnd;
  }

  log(`TAMAM: ${inserted} yeni + ${updated} güncel = ${totalFetched} CVE işlendi (${windowNum} pencere)`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
