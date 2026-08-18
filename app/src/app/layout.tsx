import type { Metadata, Viewport } from 'next';
import './globals.css';
import Nav from '@/components/Nav';
import { getStats, getSources } from '@/lib/db';
import { formatNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export const metadata: Metadata = {
  metadataBase: new URL('https://threats.0rce.com'),
  title: {
    default: 'threats.0rce.com — Threat Intelligence',
    template: '%s | threats.0rce.com',
  },
  description: 'Aggregated cyber threat intelligence. Real-time vulnerabilities, IOCs, threat actors, and AI-specific attacks.',
  // Madde 13: noindex kaldırıldı (sistem public). robots meta üzerinden yönetilebilir.
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  // Madde 6: canonical + OG + twitter image — absolutize via metadataBase
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'threats.0rce.com',
    title: 'threats.0rce.com — Threat Intelligence',
    description: 'Aggregated cyber threat intelligence. Real-time vulnerabilities, IOCs, threat actors, and AI-specific attacks.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'threats.0rce.com' }],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'threats.0rce.com — Threat Intelligence',
    description: 'Aggregated cyber threat intelligence.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [stats, sources] = await Promise.all([getStats(), getSources()]);
  const total = sources.length;
  const active = sources.filter((s: any) => s.enabled).length;
  const healthy = sources.filter((s: any) => s.enabled && (!s.last_status || s.last_status === 'ok')).length;
  const disabled = total - active;
  // Madde 11: "70+ SOURCES · LIVE" hardcoded kaldırıldı, dinamik sayılar.
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-fg antialiased overflow-x-hidden">
        <Nav />
        <main className="pt-16">{children}</main>
        <footer className="mt-16 md:mt-32 border-t border-line py-8 md:py-12">
          <div className="max-w-[1400px] mx-auto px-4 md:px-8 text-xs text-dim tracking-wider2">
            <div className="flex flex-col md:flex-row justify-between items-center gap-3 md:gap-0 text-center md:text-left">
              <div>THREATS.0RCE.COM · 2026</div>
              <div>
                {formatNumber(total)} configured · {formatNumber(active)} active · {formatNumber(healthy)} healthy{disabled > 0 ? ` · ${formatNumber(disabled)} disabled` : ''}
              </div>
              <div>NO COOKIES · NO TRACKING</div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
