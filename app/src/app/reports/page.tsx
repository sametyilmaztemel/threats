import { getStats, getReportSectorSummary, getReportActorTimeline, getReportKillChain, getReportSourceHealth, getReportTopIOCs, getReportWeeklyDigest } from '@/lib/db';
import { formatNumber } from '@/lib/format';
import Breadcrumb from '@/components/layout/Breadcrumb';

export const dynamic = 'force-dynamic';

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toISOString().split('T')[0];
}

const PHASE_COLORS: Record<string, string> = {
  recon: '#00d97e',
  weaponize: '#ffd60a',
  deliver: '#ff9500',
  exploit: '#ff3030',
  install: '#ff5c5c',
  c2: '#a05cff',
  actions: '#ff3860',
  unclassified: '#555',
};

const SECTOR_COLORS: Record<string, string> = {
  finance: '#00d97e', healthcare: '#ff3860', government: '#ffd60a',
  defense: '#a05cff', technology: '#00b4d8', telecom: '#ff9500',
  energy: '#ff5c5c', retail: '#ffd60a',
};

export default async function ReportsPage() {
  const [stats, sectors, actorTimeline, killChain, sources, topIocs, weekly] = await Promise.all([
    getStats(),
    getReportSectorSummary(12),
    getReportActorTimeline(90),
    getReportKillChain(),
    getReportSourceHealth(),
    getReportTopIOCs(undefined, 25),
    getReportWeeklyDigest(7),
  ]);

  const activeSources = sources.filter((s: any) => s.enabled);
  const healthySources = activeSources.filter((s: any) => !s.last_status || s.last_status === 'ok');
  const maxSector = sectors.length ? Math.max(...sectors.map((s: any) => s.doc_count)) : 1;
  const maxPhase = killChain.length ? Math.max(...killChain.map((k: any) => k.doc_count)) : 1;

  // Aktör timeline: son 30 günü yoğunlaştır
  const last30 = actorTimeline.filter((t: any) => {
    const d = new Date(t.day);
    return d >= new Date(Date.now() - 30 * 86400_000);
  });
  const actorTotals: Record<string, number> = {};
  for (const t of last30) actorTotals[t.actor] = (actorTotals[t.actor] || 0) + Number(t.doc_count);
  const topActors = Object.entries(actorTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <main className="min-h-screen bg-bg text-fg font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-10">
        <Breadcrumb items={[{ label: '/home', href: '/' }, { label: '/reports' }]} />

        {/* Hero */}
        <section className="mb-10 md:mb-14">
          <div className="flex items-center gap-3 text-[10px] tracking-widest2 text-dim mb-4">
            <span className="w-1.5 h-1.5 bg-high rounded-full animate-pulse" />
            <span>INTELLIGENCE REPORTS</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extralight tracking-wider2 leading-tight">
            REPORTS<span className="text-high">.</span>
          </h1>
          <p className="text-sm text-dim max-w-2xl leading-relaxed mt-3">
            Aggregated analysis across {formatNumber(stats.total_documents)} documents,
            {formatNumber(stats.total_iocs)} IOCs and {activeSources.length} active sources.
            Sector exposure, actor activity, kill-chain distribution and source health.
          </p>
        </section>

        {/* Weekly digest */}
        <section className="mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">WEEKLY DIGEST · LAST 7 DAYS</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line">
            {weekly.map((w: any) => (
              <div key={w.day} className="bg-bg p-4">
                <div className="text-[10px] text-dim tracking-widest mb-2">{fmtDate(w.day)}</div>
                <div className="text-2xl font-light text-high">{formatNumber(w.total)}</div>
                <div className="text-[10px] text-dim mt-1">
                  docs · {w.ai_count} AI · {w.has_cves} w/CVE
                </div>
                {w.sources && (
                  <div className="text-[9px] text-dim mt-2 opacity-60 line-clamp-2">
                    {w.sources.slice(0, 5).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Sector exposure */}
        <section className="mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">SECTOR EXPOSURE</div>
          {sectors.length === 0 && <div className="text-xs text-dim">No sector data yet.</div>}
          <div className="space-y-2">
            {sectors.map((s: any) => (
              <div key={s.sector} className="flex items-center gap-3">
                <div className="w-32 text-[11px] uppercase tracking-widest text-dim">
                  {s.sector}
                </div>
                <div className="flex-1 h-5 bg-fg/5 relative">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${(s.doc_count / maxSector) * 100}%`, backgroundColor: SECTOR_COLORS[s.sector] || '#00d97e' }}
                  />
                </div>
                <div className="w-24 text-right text-[11px] text-fg">
                  {formatNumber(s.doc_count)}
                  <span className="text-dim text-[9px] ml-1">
                    ({s.critical} crit)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Actor activity */}
        <section className="mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">ACTOR ACTIVITY · LAST 30 DAYS</div>
          {topActors.length === 0 && <div className="text-xs text-dim">No actor activity in window.</div>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line">
            {topActors.map(([actor, count]) => (
              <div key={actor} className="bg-bg p-4">
                <div className="text-[13px] text-fg truncate">{actor}</div>
                <div className="text-xl font-light text-[#ff3030] mt-1">{formatNumber(count)}</div>
                <div className="text-[9px] text-dim tracking-widest">MENTIONS / 30D</div>
              </div>
            ))}
          </div>
        </section>

        {/* Kill chain */}
        <section className="mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">KILL CHAIN DISTRIBUTION</div>
          {killChain.length === 0 && <div className="text-xs text-dim">No kill-chain data yet.</div>}
          <div className="space-y-2">
            {killChain.map((k: any) => (
              <div key={k.phase} className="flex items-center gap-3">
                <div className="w-40 text-[11px] uppercase tracking-widest text-dim truncate">{k.phase}</div>
                <div className="flex-1 h-5 bg-fg/5 relative">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${(k.doc_count / maxPhase) * 100}%`, backgroundColor: PHASE_COLORS[k.phase] || '#555' }}
                  />
                </div>
                <div className="w-16 text-right text-[11px] text-fg">{formatNumber(k.doc_count)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Top IOCs */}
        <section className="mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">MOST REFERENCED IOCs</div>
          <div className="border border-line overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] tracking-widest2 text-dim border-b border-line">
                  <th className="text-left px-3 py-2 font-normal">VALUE</th>
                  <th className="text-left px-3 py-2 font-normal">TYPE</th>
                  <th className="text-right px-3 py-2 font-normal">MENTIONS</th>
                  <th className="text-right px-3 py-2 font-normal">FIRST SEEN</th>
                  <th className="text-right px-3 py-2 font-normal">LAST SEEN</th>
                </tr>
              </thead>
              <tbody>
                {topIocs.map((i: any) => (
                  <tr key={`${i.value}-${i.type}`} className="border-b border-line/50 hover:bg-fg/5">
                    <td className="px-3 py-1.5 text-high break-all">{i.value}</td>
                    <td className="px-3 py-1.5 text-dim uppercase">{i.type}</td>
                    <td className="px-3 py-1.5 text-right">{formatNumber(i.doc_mentions)}</td>
                    <td className="px-3 py-1.5 text-right text-dim">{fmtDate(i.first_seen)}</td>
                    <td className="px-3 py-1.5 text-right text-dim">{fmtDate(i.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Source health */}
        <section className="mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">
            SOURCE HEALTH · {healthySources.length}/{activeSources.length} HEALTHY
          </div>
          <div className="border border-line overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] tracking-widest2 text-dim border-b border-line">
                  <th className="text-left px-3 py-2 font-normal">SOURCE</th>
                  <th className="text-left px-3 py-2 font-normal">CATEGORY</th>
                  <th className="text-right px-3 py-2 font-normal">INGESTED</th>
                  <th className="text-right px-3 py-2 font-normal">LAST FETCH</th>
                  <th className="text-left px-3 py-2 font-normal">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {activeSources.map((s: any) => (
                  <tr key={s.name} className="border-b border-line/50 hover:bg-fg/5">
                    <td className="px-3 py-1.5">{s.name}</td>
                    <td className="px-3 py-1.5 text-dim uppercase">{s.category}</td>
                    <td className="px-3 py-1.5 text-right">{formatNumber(s.docs_ingested)}</td>
                    <td className="px-3 py-1.5 text-right text-dim">{fmtDate(s.last_fetch)}</td>
                    <td className="px-3 py-1.5">
                      <span className={s.last_status && s.last_status !== 'ok' ? 'text-[#ff3860]' : 'text-[#00d97e]'}>
                        {s.last_status && s.last_status !== 'ok' ? '⚠ ' + s.last_status.slice(0, 40) : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Footer meta */}
        <footer className="border-t border-line pt-4 text-[9px] text-dim tracking-widest">
          ALL DATA AGGREGATED FROM PUBLIC SOURCES · TLP:GREEN · GENERATED {new Date().toISOString().split('T')[0]}
        </footer>
      </div>
    </main>
  );
}
