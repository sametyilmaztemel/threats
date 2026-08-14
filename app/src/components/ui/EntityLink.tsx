import Link from 'next/link';

type EntityKind = 'actor' | 'technique' | 'cve' | 'ioc' | 'sector';

export interface EntityLinkProps {
  kind: EntityKind;
  value: string;
  display?: string;
}

const KIND_COLORS: Record<EntityKind, string> = {
  actor: '#ff3030',
  technique: '#ff9500',
  cve: '#ffd60a',
  ioc: '#5ac8fa',
  sector: '#00d97e',
};

function slugify(v: string): string {
  return v.toLowerCase().trim().replace(/\s+/g, '-');
}

export default function EntityLink({ kind, value, display }: EntityLinkProps) {
  const color = KIND_COLORS[kind];
  const slug = slugify(value);
  let href = '';
  switch (kind) {
    case 'actor':
      href = `/actor/${slug}`;
      break;
    case 'technique':
      href = `/technique/${encodeURIComponent(value)}`;
      break;
    case 'cve':
      href = `/cve/${encodeURIComponent(value.toUpperCase())}`;
      break;
    case 'ioc':
      href = `/ioc/${encodeURIComponent(value)}`;
      break;
    case 'sector':
      href = `/sector/${slug}`;
      break;
  }

  return (
    <Link
      href={href}
      className="font-mono text-[12px] hover:underline transition-colors"
      style={{ color }}
    >
      {display ?? value}
    </Link>
  );
}