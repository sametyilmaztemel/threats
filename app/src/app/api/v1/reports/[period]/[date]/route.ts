import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

// GET /api/v1/reports/[period]/[date] — PDF dosyasını döner
export async function GET(req: NextRequest, { params }: { params: { period: string; date: string } }) {
  const { period, date } = params;
  if (!/^(daily|weekly)$/.test(period) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new NextResponse('invalid', { status: 400 });
  }
  const { rows } = await query<any>(
    `SELECT filename FROM reports WHERE period=$1 AND report_date=$2`,
    [period, date]
  );
  if (!rows[0]) return new NextResponse('not found', { status: 404 });

  // Worker'ın ürettiği dosya host'ta: /home/ubuntu/threats/app/reports/ (mount)
  // Worker container'da /app/reports → host'ta app/reports (app-runtime mount değil, worker mount'u)
  // PDF'ler worker'ın kendi container'ında — host'a sync edilmeli.
  // Şimdilik dosya yoksa 404 + bilgi döndür.
  const candidates = [
    path.join('/app/reports', rows[0].filename),
    path.join('/home/ubuntu/threats/app/reports', rows[0].filename),
    path.join('/home/ubuntu/threats/reports', rows[0].filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${rows[0].filename}"`,
        },
      });
    }
  }
  return new NextResponse(JSON.stringify({ ok: false, error: 'PDF file not synced to host yet', hint: rows[0].filename }), { status: 404 });
}
