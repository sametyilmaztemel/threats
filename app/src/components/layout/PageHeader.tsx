import React from 'react';

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-3 md:gap-0 mb-6 md:mb-8 border-b border-line pb-4 md:pb-6">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="text-[10px] tracking-widest2 text-dim mb-2 font-mono uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl md:text-3xl font-light tracking-wider2 text-fg break-words">{title}</h1>
        {subtitle && (
          <p className="text-[12px] md:text-[13px] text-dim mt-1 font-mono break-words">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </header>
  );
}
