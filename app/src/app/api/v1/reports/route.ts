import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/v1/reports — rapor arşivi listesi
export async function GET() {
  const { rows } = await query<any>(
    `SELECT period, report_date, filename, total_documents, total_iocs, ai_threats,
            period_new_docs, period_critical, created_at
     FROM reports ORDER BY report_date DESC, period DESC LIMIT 60`
  );
  return NextResponse.json({
    ok: true,
    count: rows.length,
    reports: rows.map((r: any) => ({
      ...r,
      url: `/reports/archive/${r.period}/${r.report_date}`,
    })),
  }, {
    headers: { 'Cache-Control': 'max-age=300, public', 'Access-Control-Allow-Origin': '*' },
  });
}
