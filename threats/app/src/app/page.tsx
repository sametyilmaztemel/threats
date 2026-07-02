import { getStats, getRecentDocuments, getDailySeverity, getSources } from '@/lib/db';
import { formatNumber, relativeTime, severityClass, severityLabel, truncate } from '@/lib/format';
import StatTile from '@/components/StatTile';
import DocumentRow from '@/components/DocumentRow';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

export default async function HomePage() {
  const [stats, recent, daily, sources] = await Promise.all([
    getStats(),
    getRecentDocuments(30),
    getDailySeverity(),
    getSources()
  ]);

  const activeSources = sources.filter(s => s.enabled).length;
  const totalSources = sources.length;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 md:py-12">
      {/* Hero / Identity */}
      <section className="mb-16 md:mb-24 mono-grid -mx-4 md:-mx-8 px-4 md:px-8 py-10 md:py-16 border-b border-line">
        <div className="flex items-center gap-3 text-[10px] tracking-widest2 text-dim mb-4 md:mb-6 flex-wrap">
          <span className="w-1.5 h-1.5 bg-fg rounded-full animate-pulse" />
          <span>SIGNAL ACTIVE</span>
          <span className="text-line">|</span>
          <span>{new Date().toISOString().slice(0, 19).replace('T', ' ')}Z</span>
        </div>
        <h1 className="text-[36px] sm:text-[48px] md:text-[64px] leading-[0.9] font-extralight tracking-wider2 mb-4 md:mb-6">
          CYBER THREAT<br />
          <span className="font-bold">INTELLIGENCE</span>
        </h1>
        <p className="text-sm text-dim max-w-2xl leading-relaxed">
          Aggregated, deduplicated, classified threat intelligence from <span className="text-fg">{activeSources}</span> primary sources.
          Real-time vulnerabilities, indicators of compromise, threat actors, and adversarial AI incidents.
        </p>
      </section>

      {/* Stat tiles */}
      <section className="mb-12 md:mb-20">
        <div className="text-[10px] tracking-widest2 text-dim mb-4">SYSTEM STATE</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line">
          <StatTile label="TOTAL DOCUMENTS" value={formatNumber(stats.total_documents)} />
          <StatTile label="CRITICAL" value={formatNumber(stats.critical_docs)} accent={stats.critical_docs > 0 ? 'crit' : undefined} />
          <StatTile label="24H DELTA" value={formatNumber(stats.docs_24h)} />
          <StatTile label="AI THREATS" value={formatNumber(stats.ai_threats)} accent="high" />
          <StatTile label="IOCS" value={formatNumber(stats.total_iocs)} />
          <StatTile label="ACTORS" value={formatNumber(stats.total_actors)} />
          <StatTile label="SOURCES" value={`${activeSources}/${totalSources}`} />
          <StatTile label="LAST FETCH" value={stats.last_fetch ? relativeTime(stats.last_fetch) : '—'} />
        </div>
      </section>

      {/* Live feed */}
      <section className="mb-12 md:mb-20">
        <div className="flex flex-wrap justify-between items-end gap-2 mb-4">
          <div>
            <div className="text-[10px] tracking-widest2 text-dim mb-1">SIGNAL</div>
            <h2 className="text-xl md:text-2xl font-light tracking-wider2">LIVE FEED <span className="terminal-cursor" /></h2>
          </div>
          <a href="/feed" className="text-[11px] tracking-widest2 text-dim hover:text-fg">[ VIEW ALL ]</a>
        </div>
        <div className="border-t border-line">
          {recent.length === 0 ? (
            <div className="py-12 md:py-16 text-center text-dim text-sm">
              <div className="mb-2 text-fg">NO DOCUMENTS YET</div>
              <div>Collector is running. First results will appear shortly.</div>
            </div>
          ) : (
            recent.map((doc: any) => <DocumentRow key={doc.id} doc={doc} />)
          )}
        </div>
      </section>

      {/* Severity timeline */}
      <section className="mb-12 md:mb-20">
        <div className="text-[10px] tracking-widest2 text-dim mb-4">SEVERITY · 90D</div>
        <div className="border border-line p-4 md:p-8">
          <div className="flex items-end gap-1 h-24 md:h-32">
            {daily.slice(-60).map((d: any) => {
              const max = Math.max(...daily.slice(-60).map((x: any) => x.total), 1);
              const h = Math.max(2, (d.total / max) * 100);
              const cR = (d.critical / Math.max(d.total, 1));
              return (
                <div
                  key={d.day.toString()}
                  className="flex-1 flex flex-col-reverse"
                  title={`${d.day.toString().slice(0, 10)} · ${d.total} (${d.critical} crit)`}
                >
                  <div className="bg-fg" style={{ height: `${h}%`, opacity: 0.3 + cR * 0.7 }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] tracking-widest2 text-dim mt-4">
            <span>60 DAYS AGO</span>
            <span>TODAY</span>
          </div>
        </div>
      </section>

      {/* Sources grid */}
      <section>
        <div className="flex flex-wrap justify-between items-end gap-2 mb-4">
          <div>
            <div className="text-[10px] tracking-widest2 text-dim mb-1">INGEST</div>
            <h2 className="text-xl md:text-2xl font-light tracking-wider2">SOURCES</h2>
          </div>
          <a href="/sources" className="text-[11px] tracking-widest2 text-dim hover:text-fg">[ ALL ]</a>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-px bg-line border border-line">
          {sources.map((s: any) => (
            <div key={s.id} className="bg-bg p-3 md:p-4 hover:bg-panel transition-colors">
              <div className="text-[9px] tracking-widest2 text-dim mb-1">T{s.tier}</div>
              <div className="text-xs truncate">{s.name}</div>
              <div className="text-[9px] text-dim mt-1">{s.type.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
