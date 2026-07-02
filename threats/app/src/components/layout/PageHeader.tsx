import React from 'react';

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex justify-between items-start mb-8 border-b border-line pb-6">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[10px] tracking-widest2 text-dim mb-2 font-mono uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl font-light tracking-wider2 text-fg">{title}</h1>
        {subtitle && (
          <p className="text-[13px] text-dim mt-1 font-mono">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0 ml-4">{actions}</div>}
    </header>
  );
}