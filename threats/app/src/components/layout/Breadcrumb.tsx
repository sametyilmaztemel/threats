import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  if (!items || items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[10px] tracking-widest2 text-dim mb-6 font-mono">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${i}-${item.label}`} className="flex items-center gap-2">
            {item.href && !isLast ? (
              <Link href={item.href} className="hover:text-fg transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-fg' : ''}>{item.label}</span>
            )}
            {!isLast && <span className="text-dim">/</span>}
          </span>
        );
      })}
    </nav>
  );
}