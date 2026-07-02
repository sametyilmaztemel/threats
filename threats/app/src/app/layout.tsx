import type { Metadata, Viewport } from 'next';
import './globals.css';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'threats.0rce.com — Threat Intelligence',
  description: 'Aggregated cyber threat intelligence. Real-time vulnerabilities, IOCs, threat actors, and AI-specific attacks.',
  robots: 'noindex, nofollow'
};

export const viewport: Viewport = {
  themeColor: '#000000'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-fg antialiased">
        <Nav />
        <main className="pt-16">{children}</main>
        <footer className="mt-32 border-t border-line py-12">
          <div className="max-w-[1400px] mx-auto px-8 text-xs text-dim tracking-wider2">
            <div className="flex justify-between items-center">
              <div>THREATS.0RCE.COM · 2026</div>
              <div>70+ SOURCES · LIVE</div>
              <div>NO COOKIES · NO TRACKING</div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
