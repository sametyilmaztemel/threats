'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'OVERVIEW' },
  { href: '/feed', label: 'FEED' },
  { href: '/reports', label: 'REPORTS' },
  { href: '/actors', label: 'ACTORS' },
  { href: '/cves', label: 'CVES' },
  { href: '/iocs', label: 'IOCS' },
  { href: '/graph', label: 'GRAPH' },
  { href: '/trends', label: 'TRENDS' },
  { href: '/ai-threats', label: 'AI' },
  { href: '/sources', label: 'SOURCES' }
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="glass fixed top-0 left-0 right-0 z-50">
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 flex-shrink-0">
          <div className="w-2 h-2 bg-fg animate-blink" />
          <span className="text-sm font-semibold tracking-widest2 whitespace-nowrap">THREATS.0RCE.COM</span>
        </Link>

        {/* Mobile menu via <details> — no JS, native accordion */}
        <details className="md:hidden ml-auto group">
          <summary className="cursor-pointer list-none flex items-center gap-2 text-[11px] tracking-widest2 text-dim hover:text-fg">
            <span className="inline-flex flex-col gap-[3px]">
              <span className="block w-4 h-px bg-current" />
              <span className="block w-4 h-px bg-current" />
              <span className="block w-4 h-px bg-current" />
            </span>
            <span>MENU</span>
          </summary>
          <div className="absolute left-0 right-0 top-16 bg-bg border-b border-line">
            <nav className="flex flex-col max-w-[1400px] mx-auto px-4 py-2 text-[12px] tracking-widest2">
              {links.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`py-2 border-b border-line last:border-b-0 hover:text-fg transition-colors ${
                    pathname === l.href ? 'text-fg' : 'text-dim'
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </details>

        {/* Desktop nav — hidden on mobile, visible md+ */}
        <div className="hidden md:flex items-center gap-4 lg:gap-6 text-[11px] tracking-widest2 text-dim">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`hover:text-fg transition-colors whitespace-nowrap ${
                pathname === l.href ? 'text-fg' : ''
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="text-[10px] tracking-widest2 text-dim items-center gap-2 hidden md:flex">
          <span className="w-1.5 h-1.5 bg-fg rounded-full animate-pulse" />
          <span>LIVE</span>
        </div>
      </div>
    </nav>
  );
}
