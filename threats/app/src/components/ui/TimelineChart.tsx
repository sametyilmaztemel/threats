export interface TimelinePoint {
  date: string;
  value: number;
  category?: string;
}

export interface TimelineChartProps {
  data: TimelinePoint[];
  height?: number;
  color?: string;
  showLabels?: boolean;
}

const VIEW_W = 800;
const PADDING_L = 40;
const PADDING_R = 12;
const PADDING_T = 8;
const PADDING_B = 24;

function parseDate(s: string): number {
  const d = new Date(s);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function formatTickDate(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const norm = n / mag;
  let nice = 1;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
}

export default function TimelineChart({
  data,
  height = 200,
  color = '#ffffff',
  showLabels = true,
}: TimelineChartProps) {
  const width = VIEW_W;
  const innerW = width - PADDING_L - PADDING_R;
  const innerH = height - PADDING_T - PADDING_B;

  if (!data || data.length === 0) {
    return (
      <div
        className="w-full border border-line bg-bg-2 flex items-center justify-center font-mono text-[11px] text-dim tracking-widest2"
        style={{ height }}
      >
        NO DATA
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => parseDate(a.date) - parseDate(b.date));
  const times = sorted.map((p) => parseDate(p.date));
  const values = sorted.map((p) => p.value);

  const minT = times[0];
  const maxT = times[times.length - 1];
  const tSpan = Math.max(1, maxT - minT);

  const rawMax = Math.max(...values, 0);
  const yMax = niceCeil(rawMax);

  const x = (t: number) => PADDING_L + ((t - minT) / tSpan) * innerW;
  const y = (v: number) => PADDING_T + innerH - (v / yMax) * innerH;

  const pathD = sorted
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(parseDate(p.date)).toFixed(2)} ${y(p.value).toFixed(2)}`)
    .join(' ');

  const areaD = `${pathD} L ${x(maxT).toFixed(2)} ${(PADDING_T + innerH).toFixed(2)} L ${x(minT).toFixed(2)} ${(PADDING_T + innerH).toFixed(2)} Z`;

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((p) => PADDING_T + innerH * p);

  const xTicks: number[] = [];
  if (sorted.length > 1) {
    const steps = Math.min(6, sorted.length);
    for (let i = 0; i < steps; i++) {
      const idx = Math.round(((sorted.length - 1) * i) / Math.max(1, steps - 1));
      xTicks.push(times[idx]);
    }
  } else if (sorted.length === 1) {
    xTicks.push(times[0]);
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      role="img"
      aria-label="Timeline chart"
      className="block"
    >
      <title>{`Timeline: ${sorted.length} points, max ${rawMax}`}</title>
      <g>
        {gridYs.map((gy, i) => (
          <line
            key={`grid-${i}`}
            x1={PADDING_L}
            x2={width - PADDING_R}
            y1={gy}
            y2={gy}
            stroke="#1a1a1a"
            strokeWidth={1}
            shapeRendering="crispEdges"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      {showLabels && (
        <g>
          {gridYs.map((gy, i) => {
            const v = yMax * (1 - i * 0.25);
            return (
              <text
                key={`yl-${i}`}
                x={PADDING_L - 6}
                y={gy + 3}
                fill="#666"
                fontSize={9}
                fontFamily="JetBrains Mono, monospace"
                textAnchor="end"
              >
                {Math.round(v)}
              </text>
            );
          })}
        </g>
      )}

      <path d={areaD} fill={color} fillOpacity={0.08} stroke="none" />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        shapeRendering="geometricPrecision"
        vectorEffect="non-scaling-stroke"
      />

      {sorted.map((p, i) => (
        <g key={`pt-${i}`}>
          <title>{`${p.date}${p.category ? ` · ${p.category}` : ''} · ${p.value}`}</title>
          <circle
            cx={x(parseDate(p.date))}
            cy={y(p.value)}
            r={2}
            fill={color}
          />
        </g>
      ))}

      {showLabels && (
        <g>
          {xTicks.map((t, i) => (
            <text
              key={`xt-${i}`}
              x={x(t)}
              y={height - 6}
              fill="#666"
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
              textAnchor="middle"
            >
              {formatTickDate(t).slice(5)}
            </text>
          ))}
        </g>
      )}

      <line
        x1={PADDING_L}
        x2={width - PADDING_R}
        y1={PADDING_T + innerH}
        y2={PADDING_T + innerH}
        stroke="#1a1a1a"
        strokeWidth={1}
        shapeRendering="crispEdges"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}