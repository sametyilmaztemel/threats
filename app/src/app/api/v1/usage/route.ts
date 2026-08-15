import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// AA-10: API abuse tespiti — 5 dk'da 500+ istek yapan IP'yi logla
// (CF rate limit 300/10s zaten engelliyor; bu uzun vadeli kötüye kullanımı tespit eder)
// Loglar: api_usage tablosuna yazılır, PDF rapora "API KULLANIMI" bölümü gelir

const USAGE: Map<string, { count: number; windowStart: number }> = new Map();
const WINDOW_MS = 5 * 60 * 1000;
const THRESHOLD = 500;

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();

  const u = USAGE.get(ip) || { count: 0, windowStart: now };
  if (now - u.windowStart > WINDOW_MS) {
    u.count = 0;
    u.windowStart = now;
  }
  u.count++;
  USAGE.set(ip, u);

  if (u.count === THRESHOLD) {
    // Eşik aşıldı — logla (DB'ye yaz)
    console.log(`[api-abuse] IP ${ip}: ${u.count} istek / 5dk — yüksek hacim`);
    try {
      const { query } = await import('@/lib/db');
      await query(
        `INSERT INTO api_usage (ip, requests, window_start) VALUES ($1, $2, NOW() - interval '5 minutes')
         ON CONFLICT (ip, window_start) DO UPDATE SET requests = EXCLUDED.requests`,
        [ip, u.count]
      );
    } catch (e) {
      console.log('[api-abuse] db log hatası:', (e as Error).message);
    }
  }

  return NextResponse.json({ status: 'ok' });
}

export const POST = GET;
