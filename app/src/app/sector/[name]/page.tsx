import { notFound } from 'next/navigation';
import { getSectorTimeline, getSectorDocs, getSectorActors } from '@/lib/db';
import Breadcrumb from '@/components/layout/Breadcrumb';
import TLPBadge from '@/components/ui/TLPBadge';
import SeverityGauge from '@/components/ui/SeverityGauge';
import { format } from '@/lib/format';

export const dynamic = 'force-dynamic';

const SECTOR_COLORS: Record<string, string> = {
  finance: '#00d97e', healthcare: '#ff3860', government: '#ffd60a',
  defense: '#a05cff', technology: '#00b4d8', telecom: '#ff9500',
  energy: '#ff5c5c', retail: '#ffd60a',
};

export default async function SectorPage({ params }: { params: { name: string } }) {
  const sector = decodeURIComponent(params.name).toLowerCase();

  const [timeline, docs, actors] = await Promise.all([
    getSectorTimeline(sector, 90),
    getSectorDocs(sector, 100),
    getSectorActors(sector, 10),
  ]);
  if (docs.length === 0) notFound();

  const maxTimeline = timeline.length ? Math.max(...timeline.map((t: any) => t.doc_count)) : 1;
  const critical = docs.filter((d: any) => d.severity >= 8).length;
  const color = SECTOR_COLORS[sector] || '#00d97e';

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <Breadcrumb items={[{ label: '/home', href: '/' }, { label: '/reports', href: '/reports' }, { label: `/sector/${sector}` }]} />

      {/* Hero */}
      <section className="mb-10">
        <div className="text-[10px] tracking-widest2 text-dim mb-3">SECTOR INTELLIGENCE</div>
        <h1 className="text-3xl md:text-5xl font-extralight tracking-wider2 uppercase" style={{ color }}>
          {sector}<span className="text-fg">.</span>
        </h1>
        <div className="flex flex-wrap gap-x-8 gap-y-2 mt-4 text-[11px] font-mono text-dim">
          <div>{docs.length} documents</div>
          <div>{critical} critical</div>
          <div>{actors.length} actors active</div>
          <div>{timeline.length > 0 ? `${timeline.length} active days / 90` : '—'}</div>
        </div>
      </section>

      {/* Activity timeline */}
      {timeline.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] tracking-widest2 text-dim">ACTIVITY · LAST 90 DAYS</div>
            <div className="text-[9px] tracking-widest text-dim">
              <span className="text-[#ff3030]">■</span> CRITICAL <span className="ml-3" style={{ color }}>■</span> ALL
            </div>
          </div>
          <div className="flex items-end gap-[2px] h-24 border-b border-line">
            {timeline.map((t: any) => {
              const h = Math.max(2, Math.round((t.doc_count / maxTimeline) * 96));
              const critH = t.critical > 0 ? Math.max(2, Math.round((t.critical / maxTimeline) * 96)) : 0;
              return (
                <div key={t.day} className="flex-1 flex items-end justify-center gap-[1px] group relative" title={`${t.day}: ${t.doc_count} docs (${t.critical} critical)`}>
                  {critH > 0 && <div className="w-1/2 bg-[#ff3030] opacity-80 group-hover:opacity-100 transition-all" style={{ height: `${critH}px` }} />}
                  <div className="w-1/2 opacity-60 group-hover:opacity-100 transition-all" style={{ height: `${h}px`, backgroundColor: color }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-dim mt-1 tracking-widest">
            <span>{timeline[0]?.day?.toString().slice(0, 10)}</span>
            <span>{timeline[timeline.length - 1]?.day?.toString().slice(0, 10)}</span>
          </div>
        </section>
      )}

      {/* Actors */}
      {actors.length > 0 && (
        <section className="mb-10">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">ACTIVE ACTORS</div>
          <div className="flex gap-2 flex-wrap">
            {actors.map((a: any) => (
              <a
                key={a.actor_name}
                href={`/actor/${a.actor_name.toLowerCase().replace(/\s+/g, '-')}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono uppercase tracking-widest2 border border-line hover:border-fg transition-colors"
              >
                {a.actor_name} <span className="text-dim">· {a.cnt}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Documents */}
      <section>
        <div className="text-[10px] tracking-widest2 text-dim mb-4">DOCUMENTS ({docs.length})</div>
        <div className="space-y-px">
          {docs.map((d: any) => (
            <a key={d.id} href={`/document/${d.id}`} className="block p-3 md:p-4 border-b border-line hover:bg-panel transition-colors">
              <div className="flex items-start justify-between gap-3 md:gap-4 mb-2">
                <div className="text-[13px] md:text-[14px] font-light leading-tight flex-1 min-w-0 break-words">{d.title}</div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {d.tlp && <TLPBadge tlp={d.tlp} size="sm" />}
                  {d.severity && <SeverityGauge value={d.severity} size="sm" />}
                </div>
              </div>
              <div className="text-[10px] text-dim font-mono">
                {d.source_name} · T{String(d.source_tier || '').replace(/^T/, '') || '?'} · {format(d.published_at || d.fetched_at)}
                {d.ai_threat && <span className="text-[#ff9500] ml-2">AI</span>}
                {d.kill_chain_phase && <span className="ml-2 uppercase">{d.kill_chain_phase}</span>}
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
