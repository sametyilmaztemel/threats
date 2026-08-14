type TLP = 'WHITE' | 'GREEN' | 'AMBER' | 'RED';

export interface TLPBadgeProps {
  tlp: TLP;
  size?: 'sm' | 'md';
}

const TLP_COLORS: Record<TLP, { color: string; borderColor: string }> = {
  WHITE: { color: '#ffffff', borderColor: '#ffffff' },
  GREEN: { color: '#00d97e', borderColor: '#00d97e' },
  AMBER: { color: '#ff9500', borderColor: '#ff9500' },
  RED: { color: '#ff3030', borderColor: '#ff3030' },
};

export default function TLPBadge({ tlp, size = 'md' }: TLPBadgeProps) {
  const { color, borderColor } = TLP_COLORS[tlp];
  const sizeClasses = size === 'sm' ? 'text-[9px] py-[1px] px-1' : 'text-[10px] py-[2px] px-1.5';

  return (
    <span
      className={`inline-flex items-center font-mono tracking-widest2 border ${sizeClasses}`}
      style={{ color, borderColor }}
    >
      [TLP:{tlp}]
    </span>
  );
}