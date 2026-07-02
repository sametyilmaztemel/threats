function severityColor(value: number, max: number): string {
  if (max <= 0) return '#00d97e';
  const pct = (value / max) * 10;
  if (pct <= 3) return '#00d97e';
  if (pct <= 6) return '#ffd60a';
  if (pct <= 8) return '#ff9500';
  return '#ff3030';
}

export interface SeverityGaugeProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_MAP: Record<'sm' | 'md' | 'lg', { h: number; w: number; labelText: string }> = {
  sm: { h: 2, w: 64, labelText: 'text-[9px]' },
  md: { h: 2, w: 120, labelText: 'text-[10px]' },
  lg: { h: 4, w: 200, labelText: 'text-[11px]' },
};

export default function SeverityGauge({
  value,
  max = 10,
  showLabel = false,
  size = 'md',
}: SeverityGaugeProps) {
  const clamped = Math.max(0, Math.min(max, value));
  const fillPct = max > 0 ? (clamped / max) * 100 : 0;
  const color = severityColor(clamped, max);
  const { h, w, labelText } = SIZE_MAP[size];

  return (
    <div className="inline-flex items-center gap-2">
      <div
        className="bg-bg-2 border border-line"
        style={{ width: w, height: h }}
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className="h-full"
          style={{ width: `${fillPct}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span
          className={`font-mono tracking-widest2 ${labelText}`}
          style={{ color }}
        >
          SEV {clamped}/{max}
        </span>
      )}
    </div>
  );
}