// app/sitemaps/[name]/route.ts — Madde 2: sitemap parçaları (cves-1.xml, actors-1.xml, documents-1.xml, static.xml)
// URL: /sitemaps/cves-1.xml   -> CVE parça 1 (50K/page)
//      /sitemaps/cves-2.xml   -> CVE parça 2
//      /sitemaps/actors-1.xml -> tüm aktörler
//      /sitemaps/documents-1.xml -> tüm dokümanlar
//      /sitemaps/static.xml   -> statik sayfalar
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const BASE = 'https://threats.0rce.com';
const PER_PAGE = 50000; // 50K URL/parça

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET(req: NextRequest, { params }: { params: { name: string } }) {
  const name = params.name; // e.g. "cves-1"
  const base = name.replace(/-\d+$/, ''); // "cves"
  const pageStr = name.includes('-') ? name.split('-').pop()! : '1';
  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const offset = (page - 1) * PER_PAGE;

  let urls: { loc: string; lastmod?: string; freq?: string; pri?: string }[] = [];

  if (name === 'static') {
    urls = [
      { loc: `${BASE}/`, freq: 'hourly', pri: '1.0' },
      { loc: `${BASE}/feed`, freq: 'hourly', pri: '0.9' },
      { loc: `${BASE}/cves`, freq: 'daily', pri: '0.8' },
      { loc: `${BASE}/actors`, freq: 'daily', pri: '0.8' },
      { loc: `${BASE}/iocs`, freq: 'daily', pri: '0.6' },
      { loc: `${BASE}/reports`, freq: 'daily', pri: '0.7' },
      { loc: `${BASE}/trends`, freq: 'daily', pri: '0.5' },
      { loc: `${BASE}/ai-threats`, freq: 'hourly', pri: '0.7' },
      { loc: `${BASE}/sources`, freq: 'weekly', pri: '0.4' },
      { loc: `${BASE}/stats`, freq: 'daily', pri: '0.4' },
      { loc: `${BASE}/graph`, freq: 'weekly', pri: '0.3' },
    ];
  } else if (base === 'cves') {
    const { rows } = await query<any>(
      `SELECT cve_id, published_date FROM cve_enrichment
       ORDER BY cve_id
       OFFSET $1 LIMIT $2`,
      [offset, PER_PAGE]
    );
    for (const c of rows) {
      urls.push({ loc: `${BASE}/cve/${esc(encodeURIComponent(c.cve_id))}`, lastmod: c.published_date ? new Date(c.published_date).toISOString() : undefined, freq: 'monthly', pri: '0.6' });
    }
    // Boş parça -> 404 (son parçadan fazla)
    if (rows.length === 0 && page > 1) {
      return new Response('Not Found', { status: 404 });
    }
  } else if (base === 'actors') {
    if (page > 1) return new Response('Not Found', { status: 404 });
    const { rows } = await query<any>(`SELECT name, updated_at FROM actors ORDER BY name`);
    for (const a of rows) {
      const slug = String(a.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      urls.push({ loc: `${BASE}/actor/${esc(slug)}`, lastmod: a.updated_at ? new Date(a.updated_at).toISOString() : undefined, freq: 'monthly', pri: '0.4' });
    }
  } else if (base === 'documents') {
    const { rows } = await query<any>(
      `SELECT id, published_at, fetched_at FROM documents
       ORDER BY id
       OFFSET $1 LIMIT $2`,
      [offset, PER_PAGE]
    );
    for (const d of rows) {
      const lm = d.published_at || d.fetched_at;
      urls.push({ loc: `${BASE}/document/${d.id}`, lastmod: lm ? new Date(lm).toISOString() : undefined, freq: 'monthly', pri: '0.3' });
    }
    if (rows.length === 0 && page > 1) {
      return new Response('Not Found', { status: 404 });
    }
  } else {
    return new Response('Not Found', { status: 404 });
  }

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u =>
      `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${u.freq ? `<changefreq>${u.freq}</changefreq>` : ''}${u.pri ? `<priority>${u.pri}</priority>` : ''}</url>`
    ).join('\n') +
    '\n</urlset>';

  return new Response(body, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600', 'Cloudflare-CDN-Cache-Control': 'public, s-maxage=3600' } });
}
