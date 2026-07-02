'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'OVERVIEW' },
  { href: '/feed', label: 'FEED' },
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
      <div className="max-w-[1400px] mx-auto px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-2 h-2 bg-fg animate-blink" />
          <span className="text-sm font-semibold tracking-widest2">THREATS.0RCE.COM</span>
        </Link>
        <div className="hidden lg:flex items-center gap-6 text-[11px] tracking-widest2 text-dim">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`hover:text-fg transition-colors ${
                pathname === l.href ? 'text-fg' : ''
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="text-[10px] tracking-widest2 text-dim flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-fg rounded-full animate-pulse" />
          <span>LIVE</span>
        </div>
      </div>
    </nav>
  );
}
