import React from 'react';

export interface TwoColumnProps {
  left: React.ReactNode;
  right: React.ReactNode;
  leftWidth?: string;
}

export default function TwoColumn({ left, right }: TwoColumnProps) {
  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-8">
      {/* Rail: on mobile comes second (below content); on md+ comes first (left, sticky) */}
      <div className="order-2 md:order-1 w-full md:w-[320px] md:flex-shrink-0 md:sticky md:top-20 md:self-start">
        {left}
      </div>
      {/* Content: on mobile comes first; on md+ takes the remaining width */}
      <div className="order-1 md:order-2 flex-1 min-w-0">{right}</div>
    </div>
  );
}
