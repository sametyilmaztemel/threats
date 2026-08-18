import { NextResponse } from 'next/server';

// /api/health/live — uygulama process'i cevap veriyorsa 200.
// DB veya dış kaynak sorgusu ÇALIŞTIRMAZ. Cache-Control: no-store. Küçük JSON.

export const dynamic = 'force-dynamic';

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || 'local';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'threats-web',
      timestamp: new Date().toISOString(),
      buildId: BUILD_ID,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      },
    }
  );
}
