// middleware.ts — Madde 14: CSP + güvenlik header'ları.
// Next.js App Router. src/ dizini altında olmalı (Next 14'te app/ veya src/).

import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
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

  // CSP (Madde 14) — minimum unsafe-inline (Next.js inline scripts nedeniyle)
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  res.headers.set('Content-Security-Policy', csp);

  // Madde 4: Kullanıcıya özel OLMAYAN dashboard sayfaları için Next/Edge
  // no-store default'unu override et — CDN+ISR için s-maxage/stale-while-revalidate.
  // CSP header'ı burada da korunur (üstte set edildi).
  const cacheable = /\/(stats|sources|actors|trends)(\?|$)/.test(req.nextUrl.pathname);
  if (cacheable) {
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
  } else if (/^\/(feed)(\?|$)/.test(req.nextUrl.pathname)) {
    // feed: searchParams dinamik ama user-specific değil — max-age 60 (kısa ISR)
    res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  }

  return res;
}

export const config = {
  matcher: [
    // tüm sayfa/API rotaları (static assetler hariç)
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};