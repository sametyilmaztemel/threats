import { NextRequest, NextResponse } from 'next/server';
import { getCVEList, getCVECount } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/v1/cves?limit=&q=&sev=&vendor=&page=
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(200, parseInt(sp.get('limit') || '50') || 50);
  const q = sp.get('q') || '';
  const sev = sp.get('sev') || '';
  const vendor = sp.get('vendor') || '';
  const page = Math.max(1, parseInt(sp.get('page') || '1') || 1);
  const sevMap: Record<string, number> = { critical: 9, high: 7, medium: 4, low: 1 };
  const minCvss = sevMap[sev] ?? undefined;

  const [cves, total] = await Promise.all([
    getCVEList(page, limit, q, minCvss, vendor),
    getCVECount(q, minCvss, vendor),
  ]);

  return NextResponse.json({
    ok: true,
    count: cves.length,
    total,
    page,
    generated: new Date().toISOString(),
    tlp: 'GREEN',
    cves: cves.map((c: any) => ({
      cve_id: c.cve_id, cvss_v3: c.cvss_v3, description: c.description,
      vendor: c.vendor, product: c.product, published_date: c.published_date,
      mentions: c.mentions, ai_mentions: c.ai_mentions,
    })),
  }, {
    headers: { 'Cache-Control': 'max-age=300, public', 'Access-Control-Allow-Origin': '*' },
  });
}
