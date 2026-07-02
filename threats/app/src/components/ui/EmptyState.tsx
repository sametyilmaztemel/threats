import Link from 'next/link';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; href: string };
}

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="w-full flex flex-col items-center justify-center text-center py-16 px-4">
      <svg
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="mb-6"
      >
        <rect x="8" y="14" width="48" height="40" stroke="#666" strokeWidth="1" />
        <line x1="8" y1="24" x2="56" y2="24" stroke="#666" strokeWidth="1" />
        <line x1="8" y1="40" x2="56" y2="40" stroke="#1a1a1a" strokeWidth="1" />
        <line x1="24" y1="14" x2="24" y2="54" stroke="#1a1a1a" strokeWidth="1" />
        <line x1="40" y1="14" x2="40" y2="54" stroke="#1a1a1a" strokeWidth="1" />
        <rect x="28" y="28" width="8" height="8" stroke="#fff" strokeWidth="1" fill="none" />
      </svg>
      <h2 className="text-[14px] tracking-widest2 text-fg font-mono uppercase">{title}</h2>
      {description && (
        <p className="text-[12px] text-dim mt-1 max-w-md font-mono">{description}</p>
      )}
      {action && (
        <Link
          href={action.href}
          className="mt-6 inline-flex items-center px-3 py-1.5 border border-line text-[11px] font-mono tracking-widest2 text-fg hover:bg-fg hover:text-bg transition-colors"
        >
          {action.label} ↗
        </Link>
      )}
    </div>
  );
}