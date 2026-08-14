import Link from 'next/link';

type EntityKind = 'actor' | 'technique' | 'cve' | 'ioc' | 'sector' | 'source' | 'category' | 'actor';

export interface EntityBadgeProps {
  kind: EntityKind;
  label: string;
  count?: number;
  href?: string;
}

const KIND_COLORS: Record<EntityKind, string> = {
  actor: '#ff3030',
  technique: '#ff9500',
  cve: '#ffd60a',
  ioc: '#5ac8fa',
  sector: '#00d97e',
  category: '#00d97e',
  source: '#888888',
};

const KIND_PREFIX: Record<EntityKind, string> = {
  actor: 'ACT',
  technique: 'TECH',
  cve: 'CVE',
  ioc: 'IOC',
  sector: 'SEC',
  category: 'CAT',
  source: 'SRC',
};

export default function EntityBadge({ kind, label, count, href }: EntityBadgeProps) {
  const color = KIND_COLORS[kind] ?? '#888888';
  const prefix = KIND_PREFIX[kind] ?? kind.toUpperCase();
  const content = (
    <>
      <span style={{ color }} className="opacity-70">[{prefix}]</span>
      <span className="text-fg">{label}</span>
      {typeof count === 'number' && (
        <span className="text-dim ml-1">· {count.toLocaleString('en-US')}</span>
      )}
    </>
  );

  const baseClasses =
    'inline-flex items-center gap-1 px-1.5 py-[2px] text-[10px] font-mono uppercase tracking-widest2 border hover:bg-fg hover:text-bg transition-colors';

  if (href) {
    return (
      <Link
        href={href}
        className={baseClasses}
        style={{ borderColor: color, color }}
      >
        {content}
      </Link>
    );
  }

  return (
    <span className={baseClasses} style={{ borderColor: color, color }}>
      {content}
    </span>
  );
}