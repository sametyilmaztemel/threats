import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/v1/documents?limit=&source=&sev=&q=&ai=
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(100, parseInt(sp.get('limit') || '25') || 25);
  const source = sp.get('source') || '';
  const sev = sp.get('sev') || '';
  const q = sp.get('q') || '';
  const ai = sp.get('ai') === '1';

  const conds: string[] = [];
  const params: any[] = [];
  let p = 1;
  if (source) { conds.push(`s.name ILIKE $${p++}`); params.push(`%${source}%`); }
  if (sev) { conds.push(`d.severity >= $${p++}`); params.push(parseFloat(sev) || 0); }
  if (q) { conds.push(`(d.title ILIKE $${p} OR d.summary ILIKE $${p} OR d.content ILIKE $${p})`); params.push(`%${q}%`); p++; }
  if (ai) conds.push(`d.ai_threat = TRUE`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const { rows } = await query<any>(
    `SELECT d.id, d.title, d.url, d.summary, d.severity, d.ai_threat,
            d.published_at, d.fetched_at, d.cves, d.actors, d.tlp,
            s.name as source_name
     FROM documents d
     LEFT JOIN sources s ON d.source_id = s.id
     ${where}
     ORDER BY COALESCE(d.published_at, d.fetched_at) DESC
     LIMIT $${p}`,
    [...params, limit]
  );

  return NextResponse.json({
    ok: true,
    count: rows.length,
    generated: new Date().toISOString(),
    tlp: 'GREEN',
    documents: rows.map((r: any) => ({
      id: r.id, title: r.title, url: r.url, summary: r.summary,
      severity: r.severity, ai_threat: r.ai_threat,
      published_at: r.published_at, fetched_at: r.fetched_at,
      cves: r.cves, actors: r.actors, tlp: r.tlp, source: r.source_name,
    })),
  }, {
    headers: { 'Cache-Control': 'max-age=300, public', 'Access-Control-Allow-Origin': '*' },
  });
}
