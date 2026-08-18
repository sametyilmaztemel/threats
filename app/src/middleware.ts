// middleware.ts — Madde 14: CSP + güvenlik header'ları.
// Next.js App Router. src/ dizini altında olmalı (Next 14'te app/ veya src/).

import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  // MADDE 2 güvenlik: origin-threats.0rce.com yalnızca Worker'ın bildiği
  // X-Origin-Auth secret'ı ile erişilebilir olmalı (halka açık bypass değil).
  // Host header'ına bak (req.nextUrl.hostname CF tunnel'da farklı olabiliyor).
  const host = (req.headers.get('host') || req.nextUrl.hostname || '').toLowerCase();
  if (host.startsWith('origin-threats')) {
    const expected = process.env.ORIGIN_AUTH_SECRET || '';
    const provided = req.headers.get('x-origin-auth') || '';
    if (!expected || provided !== expected) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  const res = NextResponse.next();

  // Nonce-based CSP için request header'ı
  // Not: Next.js App Router nonce mekanizması için özel integration gerek;
  // şimdilik strict-dynamic + 'self' + unsafe-inline kabul ediyoruz.

  // HSTS
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // X-Frame-Options
  res.headers.set('X-Frame-Options', 'DENY');
  // X-Content-Type-Options
  res.headers.set('X-Content-Type-Options', 'nosniff');
  // Referrer-Policy
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions-Policy
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  // CSP (Madde 4/14 hardening) — unsafe-eval KALDIRILDI (production).
  // script-src 'unsafe-inline': Next.js App Router inline __next_f hydration için
  // zorunlu (dinamik RSC payload, hash kullanılamaz) — Madde 3 Worker nonce'a
  // geçilene kadar korunur. style-src 'unsafe-inline' kaldırıldı: HTML'de inline
  // style attribute yok, tüm stiller external/class-based.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  res.headers.set('Content-Security-Policy', csp);

  // Madde 1: Browser ve Cloudflare edge cache sürelerini başlık bazında AYIR.
  // Browser Cache TTL zone'dan "Respect Existing Headers" (0) yapıldı; CF artık
  // origin'in Cache-Control'ünü override etmez. Burada:
  //  - Cache-Control = browser için (kısa: stale olmasın)
  //  - Cloudflare-CDN-Cache-Control = edge için (uzun: CDN cache)
  // feed: browser 0s, edge 60s. Diğer public listeler: browser 60s, edge 300s.
  const pathname = req.nextUrl.pathname;
  const isFeed = pathname === '/feed' || pathname.startsWith('/feed');
  const isPublic = /\/(stats|sources|actors|trends|iocs|cves|ai-threats|reports|graph)(\/|\?|$)/.test(pathname);

  if (req.nextUrl.pathname !== '/bookmarks' && !pathname.startsWith('/api/') && !pathname.includes('/admin')) {
    if (isFeed) {
      // browser max-age=0, edge s-maxage=60 (CF edge s-maxage'i Cache-Control içinde okur;
      // Cloudflare-CDN-Cache-Control tek başına edge'i doldurmuyor).
      res.headers.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
      res.headers.set('Cloudflare-CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    } else if (isPublic) {
      res.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=300');
      res.headers.set('Cloudflare-CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
    }
  }

  return res;
}

export const config = {
  matcher: [
    // tüm sayfa/API rotaları (static assetler hariç)
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};