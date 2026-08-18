import { getStats, getReportSourceHealth } from '@/lib/db';
import { query } from '@/lib/db';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { formatNumber } from '@/lib/format';

export const revalidate = 300; // ISR 5dk cache (force-dynamic kaldırıldı: beraber çalışmazlar)

export default async function StatsPage() {
  const [stats, sources] = await Promise.all([getStats(), getReportSourceHealth()]);

  const iocByType = (await query<any>(
    `SELECT type, COUNT(*)::int as n FROM iocs GROUP BY type ORDER BY n DESC`
  )).rows;

  const docsBySource = (await query<any>(
    `SELECT s.name, COUNT(d.id)::int as n FROM sources s
     LEFT JOIN documents d ON d.source_id = s.id
     GROUP BY s.name ORDER BY n DESC LIMIT 12`
  )).rows;

  const severityDist = (await query<any>(
    `SELECT CASE WHEN severity >= 9 THEN 'critical' WHEN severity >= 7 THEN 'high'
                 WHEN severity >= 4 THEN 'medium' ELSE 'low' END as bucket,
            COUNT(*)::int as n
     FROM documents GROUP BY bucket ORDER BY n DESC`
  )).rows;

  const activeSources = sources.filter((s: any) => s.enabled);
  const maxSource = docsBySource.length ? Math.max(...docsBySource.map((d: any) => d.n)) : 1;
  const maxIoc = iocByType.length ? Math.max(...iocByType.map((d: any) => d.n)) : 1;
  const maxSev = severityDist.length ? Math.max(...severityDist.map((d: any) => d.n)) : 1;

  const sevColors: Record<string, string> = { critical: '#ff3030', high: '#ff5c5c', medium: '#ffd60a', low: '#00d97e' };

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <Breadcrumb items={[{ label: '/home', href: '/' }, { label: '/stats' }]} />

      <section className="mb-10">
        <div className="text-[10px] tracking-widest2 text-dim mb-3">DATA HEALTH</div>
        <h1 className="text-3xl md:text-5xl font-extralight tracking-wider2">STATS<span className="text-high">.</span></h1>
        <p className="text-sm text-dim max-w-2xl leading-relaxed mt-3">
          Transparency dashboard — corpus size, ingestion rates, severity distribution, source productivity.
        </p>
      </section>

      {/* Core stats */}
      <section className="mb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line">
          {[
            ['DOCUMENTS', stats.total_documents],
            ['IOCs', stats.total_iocs],
            ['AI THREATS', stats.ai_threats],
            ['CRITICAL DOCS', stats.critical_docs],
          ].map(([label, val]) => (
            <div key={label as string} className="bg-bg p-4 md:p-6">
              <div className="text-[9px] tracking-widest2 text-dim mb-2">{label}</div>
              <div className="text-2xl md:text-3xl font-light text-high">{formatNumber(val as number)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Severity distribution */}
      <section className="mb-12">
        <div className="text-[10px] tracking-widest2 text-dim mb-4">SEVERITY DISTRIBUTION</div>
        <div className="space-y-2">
          {severityDist.map((s: any) => (
            <div key={s.bucket} className="flex items-center gap-3">
              <div className="w-28 text-[11px] uppercase tracking-widest text-dim">{s.bucket}</div>
              <div className="flex-1 h-5 bg-fg/5">
                <div className="h-full" style={{ width: `${(s.n / maxSev) * 100}%`, backgroundColor: sevColors[s.bucket] || '#555' }} />
              </div>
              <div className="w-20 text-right text-[11px]">{formatNumber(s.n)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* IOC type distribution */}
      <section className="mb-12">
        <div className="text-[10px] tracking-widest2 text-dim mb-4">IOC TYPE DISTRIBUTION</div>
        <div className="space-y-2">
          {iocByType.map((t: any) => (
            <div key={t.type} className="flex items-center gap-3">
              <div className="w-32 text-[11px] uppercase tracking-widest text-dim truncate">{t.type.replace('_', ' ')}</div>
              <div className="flex-1 h-5 bg-fg/5">
                <div className="h-full bg-[#00b4d8]" style={{ width: `${(t.n / maxIoc) * 100}%` }} />
              </div>
              <div className="w-20 text-right text-[11px]">{formatNumber(t.n)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Top sources by docs */}
      <section className="mb-12">
        <div className="text-[10px] tracking-widest2 text-dim mb-4">TOP SOURCES BY INGESTION</div>
        <div className="space-y-2">
          {docsBySource.map((s: any) => (
            <div key={s.name} className="flex items-center gap-3">
              <div className="w-48 text-[11px] text-dim truncate">{s.name}</div>
              <div className="flex-1 h-5 bg-fg/5">
                <div className="h-full bg-[#00d97e] opacity-70" style={{ width: `${(s.n / maxSource) * 100}%` }} />
              </div>
              <div className="w-20 text-right text-[11px]">{formatNumber(s.n)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Source health summary */}
      <section className="mb-12">
        <div className="text-[10px] tracking-widest2 text-dim mb-4">SOURCE HEALTH</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line">
          <div className="bg-bg p-4">
            <div className="text-[9px] tracking-widest2 text-dim mb-2">ACTIVE</div>
            <div className="text-2xl font-light text-[#00d97e]">{activeSources.length}</div>
          </div>
          <div className="bg-bg p-4">
            <div className="text-[9px] tracking-widest2 text-dim mb-2">LAST FETCH</div>
            <div className="text-[13px] font-mono mt-1">{stats.last_fetch ? new Date(stats.last_fetch).toISOString().split('T')[0] : '—'}</div>
          </div>
          <div className="bg-bg p-4">
            <div className="text-[9px] tracking-widest2 text-dim mb-2">DOCS / 24H</div>
            <div className="text-2xl font-light text-high">{formatNumber(stats.docs_24h)}</div>
          </div>
          <div className="bg-bg p-4">
            <div className="text-[9px] tracking-widest2 text-dim mb-2">DOCS / 7D</div>
            <div className="text-2xl font-light text-high">{formatNumber(stats.docs_7d)}</div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line pt-4 text-[9px] text-dim tracking-widest">
        TLP:GREEN · GENERATED {new Date().toISOString().split('T')[0]}
      </footer>
    </div>
  );
}
