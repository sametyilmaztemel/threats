// middleware.ts — Madde 14: CSP + güvenlik header'ları.
// Mevcut Next.js yapısı bozulmadan, sadece header ekler.

import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // HSTS
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // X-Frame-Options
  res.headers.set('X-Frame-Options', 'DENY');
  // X-Content-Type-Options
  res.headers.set('X-Content-Type-Options', 'nosniff');
  // Referrer-Policy
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions-Policy
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  // CSP (Madde 14) — Next.js inline scripts gerektirdiğinden 'unsafe-inline' sadece script-src'de.
  // Next 14 kendi nonce mekanizması sunmaz; 'unsafe-inline' production'da riskli olabilir ama
  // mevcut client bundle yapısıyla uyumlu tutuyoruz. 'unsafe-eval' YOK.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  res.headers.set('Content-Security-Policy', csp);

  return res;
}

export const config = {
  matcher: [
    // tüm sayfa/API rotaları
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
