import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/v1/iocs?limit=&type=&q=
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(200, parseInt(sp.get('limit') || '50') || 50);
  const type = sp.get('type') || '';
  const q = sp.get('q') || '';

  const conds: string[] = [];
  const params: any[] = [];
  let p = 1;
  if (type) { conds.push(`i.type = $${p++}`); params.push(type); }
  if (q) { conds.push(`i.value ILIKE $${p++}`); params.push(`%${q}%`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const { rows } = await query<any>(
    `SELECT i.id, i.value, i.type, i.confidence, i.first_seen, i.last_seen,
            i.tags, s.name as source_name
     FROM iocs i
     LEFT JOIN sources s ON i.source_id = s.id
     ${where}
     ORDER BY i.created_at DESC
     LIMIT $${p}`,
    [...params, limit]
  );

  return NextResponse.json({
    ok: true,
    count: rows.length,
    generated: new Date().toISOString(),
    tlp: 'GREEN',
    iocs: rows.map((r: any) => ({
      id: r.id, value: r.value, type: r.type, confidence: r.confidence,
      first_seen: r.first_seen, last_seen: r.last_seen,
      tags: r.tags, source: r.source_name,
    })),
  }, {
    headers: { 'Cache-Control': 'max-age=300, public', 'Access-Control-Allow-Origin': '*' },
  });
}
