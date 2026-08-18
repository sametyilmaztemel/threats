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

  return res;
}

export const config = {
  matcher: [
    // tüm sayfa/API rotaları (static assetler hariç)
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};