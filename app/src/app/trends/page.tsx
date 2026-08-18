import { getDailySeverity, getDailyStats, getSectorKillChainCross, getActorTimeSeries, getCveAgeDistribution } from '@/lib/db';

export const revalidate = 300; // ISR 5dk cache

const PHASE_COLORS: Record<string, string> = {
  recon: '#00d97e', weaponize: '#ffd60a', deliver: '#ff9500',
  exploit: '#ff3030', install: '#ff5c5c', c2: '#a05cff',
  actions: '#ff3860', unassigned: '#444',
};
const SECTOR_COLORS: Record<string, string> = {
  finance: '#00d97e', healthcare: '#ff3860', government: '#ffd60a',
  defense: '#a05cff', technology: '#00b4d8', telecom: '#ff9500',
  energy: '#ff5c5c', retail: '#ffd60a', other: '#555',
};
const AGE_COLORS: Record<string, string> = { '0-30d': '#ff3030', '31-90d': '#ff5c5c', '91-365d': '#ffd60a', '1y+': '#00d97e' };

export default async function TrendsPage() {
  const [daily, growth, cross, actorSeries, cveAges] = await Promise.all([
    getDailySeverity(),
    getDailyStats(60),
    getSectorKillChainCross(),
    getActorTimeSeries(30),
    getCveAgeDistribution(),
  ]);
  const recent = daily.slice(-30);
  const max = Math.max(...recent.map((d: any) => d.total), 1);
  const growthMax = Math.max(...growth.map((g: any) => g.documents), 1);

  // Cross: sektör → kill chain matrisi
  const sectors = [...new Set(cross.map((c: any) => c.sector))];
  const phases = [...new Set(cross.map((c: any) => c.phase))].slice(0, 6);
  const cell = (s: string, p: string) => cross.find((c: any) => c.sector === s && c.phase === p)?.n || 0;
  const maxCell = Math.max(...cross.map((c: any) => c.n), 1);

  // Aktör zaman serisi: top 5 aktör
  const actorCounts = new Map<string, number>();
  for (const a of actorSeries) actorCounts.set(a.actor_name, (actorCounts.get(a.actor_name) || 0) + a.n);
  const topActors = [...actorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);
  const actorDays = [...new Set(actorSeries.map((a: any) => a.day))];
  const actorMax = Math.max(...actorSeries.map((a: any) => a.n), 1);

  const maxAge = Math.max(...cveAges.map((c: any) => c.n), 1);

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <div className="mb-6 md:mb-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-1">/TRENDS</div>
        <h1 className="text-2xl md:text-3xl font-light tracking-wider2">TIMELINE</h1>
      </div>

      {/* Platform growth (AA-7) */}
      <div className="border border-line p-3 md:p-8 mb-8 md:mb-12">
        <div className="text-[10px] tracking-widest2 text-dim mb-4">PLATFORM GROWTH · 60D</div>
        <div className="flex items-end gap-px h-40 md:h-48">
          {growth.map((g: any) => {
            const h = Math.max(2, (g.documents / growthMax) * 100);
            return (
              <div key={g.day} className="flex-1 flex flex-col items-stretch justify-end group relative">
                <div
                  className="bg-[#00d97e]/70 hover:bg-[#00d97e] transition-colors"
                  style={{ height: `${h}%` }}
                  title={`${g.day}: ${g.documents} docs · ${g.cves} CVEs`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[9px] text-dim mt-1 tracking-widest">
          <span>{growth[0]?.day?.toString().slice(0, 10)}</span>
          <span className="hidden md:inline">{growth[Math.floor(growth.length / 2)]?.day?.toString().slice(0, 10)}</span>
          <span>{growth[growth.length - 1]?.day?.toString().slice(0, 10)}</span>
        </div>
        {growth.length > 0 && (
          <div className="mt-3 flex gap-4 text-[10px] font-mono text-dim">
            <span>DOCS <span className="text-fg">{growth[growth.length - 1]?.documents ?? 0}</span></span>
            <span>IOCS <span className="text-fg">{growth[growth.length - 1]?.iocs ?? 0}</span></span>
            <span>CVES <span className="text-fg">{growth[growth.length - 1]?.cves ?? 0}</span></span>
            <span className="hidden md:inline">ACTORS <span className="text-fg">{growth[growth.length - 1]?.actors ?? 0}</span></span>
            <span className="hidden md:inline">AI <span className="text-fg">{growth[growth.length - 1]?.ai_threats ?? 0}</span></span>
            <span>KEV <span className="text-fg">{growth[growth.length - 1]?.kev_cves ?? 0}</span></span>
          </div>
        )}
      </div>

      {/* Severity timeline */}
      <div className="border border-line p-3 md:p-8 mb-8 md:mb-12">
        <div className="text-[10px] tracking-widest2 text-dim mb-4">SEVERITY OVER TIME</div>
        <div className="flex items-end gap-px h-48 md:h-64">
          {recent.map((d: any) => {
            const total = d.total / max * 100;
            const c = (d.critical / max) * 100;
            const h = (d.high / max) * 100;
            const m = (d.medium / max) * 100;
            return (
              <div key={d.day.toString()} className="flex-1 flex flex-col-reverse group relative" title={`${d.day.toString().slice(0, 10)}: ${d.total}`}>
                <div className="bg-med" style={{ height: `${m}%` }} />
                <div className="bg-high" style={{ height: `${h}%` }} />
                <div className="bg-crit" style={{ height: `${c}%` }} />
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 md:gap-6 mt-4 md:mt-6 text-[10px] tracking-widest2 text-dim">
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-crit" />CRITICAL</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-high" />HIGH</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-med" />MEDIUM</div>
        </div>
      </div>

      {/* Sector × Kill chain matrix */}
      {sectors.length > 0 && phases.length > 0 && (
        <div className="mb-8 md:mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">SECTOR × KILL CHAIN MATRIX</div>
          <div className="border border-line overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] tracking-widest2 text-dim border-b border-line">
                  <th className="text-left px-3 py-2 font-normal">SECTOR</th>
                  {phases.map((p: any) => (
                    <th key={p} className="text-center px-2 py-2 font-normal uppercase" style={{ color: PHASE_COLORS[p] || '#888' }}>
                      {p.slice(0, 8)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sectors.map((s: any) => (
                  <tr key={s} className="border-b border-line/50">
                    <td className="px-3 py-1.5 font-mono uppercase text-[10px]" style={{ color: SECTOR_COLORS[s] || '#888' }}>{s}</td>
                    {phases.map((p: any) => {
                      const n = cell(s, p);
                      return (
                        <td key={p} className="px-2 py-1.5 text-center">
                          {n > 0 && (
                            <div className="relative h-5 bg-fg/5 mx-auto" style={{ maxWidth: 80 }}>
                              <div className="absolute bottom-0 left-0 h-full" style={{ width: `${(n / maxCell) * 100}%`, backgroundColor: PHASE_COLORS[p] || '#555', opacity: 0.7 }} />
                              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono">{n}</span>
                            </div>
                          )}
                          {n === 0 && <span className="text-dim/30">·</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actor time series */}
      {topActors.length > 0 && actorDays.length > 0 && (
        <div className="mb-8 md:mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">TOP ACTOR ACTIVITY · 30 DAYS</div>
          <div className="border border-line p-3 md:p-6">
            {topActors.map((name, ai) => {
              const color = ['#ff3030', '#ffd60a', '#00d97e', '#a05cff', '#00b4d8'][ai % 5];
              return (
                <div key={name} className="flex items-center gap-3 mb-2">
                  <div className="w-36 text-[10px] font-mono uppercase tracking-widest truncate" style={{ color }}>{name}</div>
                  <div className="flex-1 flex items-end gap-px h-10">
                    {actorDays.map((day: any) => {
                      const n = actorSeries.find((a: any) => a.actor_name === name && a.day === day)?.n || 0;
                      return (
                        <div
                          key={day.toString()}
                          className="flex-1"
                          style={{ height: `${Math.max(1, (n / actorMax) * 100)}%`, backgroundColor: n > 0 ? color : '#ffffff08' }}
                          title={`${name} ${day.toString().slice(0, 10)}: ${n}`}
                        />
                      );
                    })}
                  </div>
                  <div className="w-10 text-right text-[10px] font-mono text-dim">{actorCounts.get(name)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CVE age distribution */}
      {cveAges.length > 0 && (
        <div className="mb-8 md:mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">CVE AGE DISTRIBUTION</div>
          <div className="space-y-2">
            {cveAges.map((c: any) => (
              <div key={c.bucket} className="flex items-center gap-3">
                <div className="w-16 text-[11px] font-mono text-dim">{c.bucket}</div>
                <div className="flex-1 h-5 bg-fg/5">
                  <div className="h-full" style={{ width: `${(c.n / maxAge) * 100}%`, backgroundColor: AGE_COLORS[c.bucket] || '#555' }} />
                </div>
                <div className="w-16 text-right text-[11px] font-mono">{c.n}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
