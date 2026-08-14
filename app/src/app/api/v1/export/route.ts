import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/v1/export?format=stix|csv|jsonl&type=iocs|documents|cves&limit=
// CTI araçları için dışa aktarma (MISP/OpenCTI import-ready)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const format = sp.get('format') || 'csv';
  const type = sp.get('type') || 'iocs';
  const limit = Math.min(5000, parseInt(sp.get('limit') || '1000') || 1000);

  if (type === 'iocs') {
    const { rows } = await query<any>(
      `SELECT i.value, i.type, i.confidence, i.first_seen, i.last_seen, i.tags,
              s.name as source_name
       FROM iocs i LEFT JOIN sources s ON i.source_id = s.id
       ORDER BY i.created_at DESC LIMIT $1`, [limit]
    );
    if (format === 'jsonl') {
      const body = rows.map((r: any) => JSON.stringify({
        value: r.value, type: r.type, confidence: r.confidence,
        first_seen: r.first_seen, last_seen: r.last_seen, tags: r.tags, source: r.source_name,
      })).join('\n');
      return new NextResponse(body, { headers: { 'Content-Type': 'application/x-ndjson', 'Content-Disposition': `attachment; filename="iocs.jsonl"` } });
    }
    if (format === 'stix') {
      const bundle = {
        type: 'bundle', id: `bundle--${crypto.randomUUID()}`,
        spec_version: '2.1', objects: rows.map((r: any) => ({
          type: 'indicator', id: `indicator--${crypto.randomUUID()}`,
          pattern: stixPattern(r.value, r.type), created: new Date().toISOString(),
          modified: new Date().toISOString(), valid_from: r.first_seen || new Date().toISOString(),
          confidence: r.confidence != null ? Math.round(r.confidence * 100) : 80,
          labels: [r.type],
          source: r.source_name,
        })),
      };
      return NextResponse.json(bundle, { headers: { 'Content-Disposition': `attachment; filename="iocs-stix.json"` } });
    }
    // CSV (default)
    const header = 'value,type,confidence,first_seen,last_seen,tags,source\n';
    const body = header + rows.map((r: any) =>
      [csv(r.value), r.type, r.confidence ?? '', r.first_seen || '', r.last_seen || '', csv((r.tags || []).join(' ')), csv(r.source_name || '')].join(',')
    ).join('\n');
    return new NextResponse(body, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="iocs.csv"` } });
  }

  if (type === 'cves') {
    const { rows } = await query<any>(
      `SELECT cve_id, cvss_v3, epss, in_kev, vendor, product, description, published_date
       FROM cve_enrichment ORDER BY cvss_v3 DESC NULLS LAST LIMIT $1`, [limit]
    );
    if (format === 'jsonl') {
      const body = rows.map((r: any) => JSON.stringify(r)).join('\n');
      return new NextResponse(body, { headers: { 'Content-Type': 'application/x-ndjson', 'Content-Disposition': `attachment; filename="cves.jsonl"` } });
    }
    if (format === 'stix') {
      const bundle = {
        type: 'bundle', id: `bundle--${crypto.randomUUID()}`,
        spec_version: '2.1', objects: rows.map((r: any) => ({
          type: 'vulnerability', id: `vulnerability--${crypto.randomUUID()}`,
          name: r.cve_id, created: r.published_date || new Date().toISOString(),
          modified: new Date().toISOString(), description: r.description || '',
          external_references: [{ source_name: 'NVD', external_id: r.cve_id }],
          x_cvss_v3: r.cvss_v3, x_epss: r.epss, x_in_kev: r.in_kev,
          x_vendor: r.vendor, x_product: r.product,
        })),
      };
      return NextResponse.json(bundle, { headers: { 'Content-Disposition': `attachment; filename="cves-stix.json"` } });
    }
    const header = 'cve_id,cvss_v3,epss,in_kev,vendor,product,published_date\n';
    const body = header + rows.map((r: any) =>
      [r.cve_id, r.cvss_v3 ?? '', r.epss ?? '', r.in_kev ? 'true' : 'false', csv(r.vendor || ''), csv(r.product || ''), r.published_date || ''].join(',')
    ).join('\n');
    return new NextResponse(body, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="cves.csv"` } });
  }

  return new NextResponse(JSON.stringify({ ok: false, error: 'type must be iocs|cves' }), { status: 400 });
}

function csv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stixPattern(value: string, type: string): string {
  if (type.includes('ip')) return `[ipv4-addr:value = '${value}']`;
  if (type.includes('url')) return `[url:value = '${value}']`;
  if (type.includes('domain')) return `[domain-name:value = '${value}']`;
  if (type.includes('sha256')) return `[file:hashes.'SHA-256' = '${value}']`;
  if (type.includes('sha1')) return `[file:hashes.'SHA-1' = '${value}']`;
  if (type.includes('md5')) return `[file:hashes.'MD5' = '${value}']`;
  return `[indicator:value = '${value}']`;
}
