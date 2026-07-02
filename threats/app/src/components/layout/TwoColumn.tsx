import React from 'react';

export interface TwoColumnProps {
  left: React.ReactNode;
  right: React.ReactNode;
  leftWidth?: string;
}

export default function TwoColumn({ left, right, leftWidth = '320px' }: TwoColumnProps) {
  return (
    <div className="flex gap-8">
      <div
        className="sticky top-20 self-start flex-shrink-0"
        style={{ width: leftWidth }}
      >
        {left}
      </div>
      <div className="flex-1 min-w-0">{right}</div>
    </div>
  );
}