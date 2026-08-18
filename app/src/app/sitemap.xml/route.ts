// app/sitemap.xml/route.ts — Madde 2: sitemap index
// Parça sayılarını DB count'lardan hesaplar ve /sitemaps/*.xml parçalarını listeler.
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const BASE = 'https://threats.0rce.com';
const PER_PAGE = 50000;

export async function GET() {
  // parça sayılarını hesapla
  let cvePages = 1, docPages = 1;
  try {
    const cve = await query<any>(`SELECT COUNT(*)::int c FROM cve_enrichment`);
    cvePages = Math.max(1, Math.ceil((cve.rows[0]?.c || 1) / PER_PAGE));
  } catch {}
  try {
    const doc = await query<any>(`SELECT COUNT(*)::int c FROM documents`);
    docPages = Math.max(1, Math.ceil((doc.rows[0]?.c || 1) / PER_PAGE));
  } catch {}

  const sitemaps: string[] = [];
  sitemaps.push(`${BASE}/sitemaps/static`);
  for (let i = 1; i <= cvePages; i++) sitemaps.push(`${BASE}/sitemaps/cves-${i}`);
  sitemaps.push(`${BASE}/sitemaps/actors-1`);
  for (let i = 1; i <= docPages; i++) sitemaps.push(`${BASE}/sitemaps/documents-${i}`);

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    sitemaps.map(s => `  <sitemap><loc>${s}</loc></sitemap>`).join('\n') +
    '\n</sitemapindex>';

  return new Response(body, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600', 'Cloudflare-CDN-Cache-Control': 'public, s-maxage=3600' } });
}
