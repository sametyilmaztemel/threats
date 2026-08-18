// app/sitemap.ts — Madde 13/12: dinamik sitemap.xml
// Ana route'lar + en son/önemli aktör, CVE ve doküman detay sayfaları.
// Detay sayfaları limitli (her istekte tüm DB'yi tarama) ve değeri yüksek
// kayıtlar (ai_threat veya yüksek severity gibi).
import type { MetadataRoute } from 'next';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://threats.0rce.com';
  const urls: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/feed`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/cves`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/actors`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/iocs`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.6 },
    { url: `${base}/reports`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/trends`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.5 },
    { url: `${base}/ai-threats`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.7 },
    { url: `${base}/sources`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.4 },
    { url: `${base}/stats`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.4 },
    { url: `${base}/graph`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.3 },
  ];

  // Top sensible CVEs (limitli — 500 CVE detayı)
  try {
    const cves = await query<any>(
      `SELECT cve_id, published_date FROM cve_enrichment
       WHERE cvss_v3 IS NOT NULL
       ORDER BY cvss_v3 DESC NULLS LAST
       LIMIT 500`
    );
    for (const c of cves.rows) {
      urls.push({
        url: `${base}/cve/${encodeURIComponent(c.cve_id)}`,
        lastModified: c.published_date ? new Date(c.published_date) : new Date(),
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    }
  } catch {}

  // Top actors (limitli — 100)
  try {
    const actors = await query<any>(
      `SELECT name FROM actors
       ORDER BY document_count DESC NULLS LAST
       LIMIT 100`
    );
    for (const a of actors.rows) {
      urls.push({
        url: `${base}/actor/${encodeURIComponent(String(a.name).toLowerCase().replace(/\s+/g, '-'))}`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.4,
      });
    }
  } catch {}

  // Son dokümanlar (limitli — 200)
  try {
    const docs = await query<any>(
      `SELECT id, published_at, fetched_at FROM documents
       ORDER BY COALESCE(fetched_at, published_at) DESC
       LIMIT 200`
    );
    for (const d of docs.rows) {
      urls.push({
        url: `${base}/document/${d.id}`,
        lastModified: new Date(d.published_at || d.fetched_at || Date.now()),
        changeFrequency: 'monthly',
        priority: 0.3,
      });
    }
  } catch {}

  return urls;
}