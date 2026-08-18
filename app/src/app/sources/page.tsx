import { getSources } from '@/lib/db';
import { relativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5dk cache

const CATEGORIES = ['all', 'vendor', 'news', 'official', 'ai', 'ioc', 'ai_research', 'attacker_ips', 'c2_ips', 'ssl_blacklist', 'malicious_urls', 'cve_exploit', 'phishing_urls', 'local'];

export default async function SourcesPage({ searchParams }: { searchParams: { cat?: string } }) {
  const cat = searchParams.cat || 'all';
  const all = await getSources();
  const sources = cat === 'all' ? all : all.filter((s: any) => s.category === cat);
  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <div className="mb-6 md:mb-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-1">/SOURCES</div>
        <h1 className="text-2xl md:text-3xl font-light tracking-wider2">SOURCES <span className="terminal-cursor" /></h1>
        <p className="text-xs text-dim mt-2 break-words">{sources.length} shown · {all.filter(s => s.enabled).length} active</p>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-4 md:mb-6 text-[11px] tracking-widest2 flex-wrap">
        {CATEGORIES.map(c => (
          <a
            key={c}
            href={c === 'all' ? '/sources' : `/sources?cat=${c}`}
            className={`px-3 py-1 border ${cat === c ? 'border-fg text-fg' : 'border-line text-dim hover:text-fg hover:border-fg'}`}
          >
            {c.toUpperCase()}
          </a>
        ))}
      </div>

      <div className="border border-line overflow-x-auto">
        <div className="grid grid-cols-13 text-[10px] tracking-widest2 text-dim border-b border-line bg-panel min-w-[760px]">
          <div className="col-span-1 p-3 md:p-4">T</div>
          <div className="col-span-3 p-3 md:p-4">NAME</div>
          <div className="col-span-2 p-3 md:p-4">TYPE</div>
          <div className="col-span-2 p-3 md:p-4">CATEGORY</div>
          <div className="col-span-2 p-3 md:p-4">LANG</div>
          <div className="col-span-1 p-3 md:p-4 text-right">ITEMS</div>
          <div className="col-span-2 p-3 md:p-4 text-right">7D QUALITY</div>
        </div>
        {sources.map((s: any) => (
          <div key={s.id} className="grid grid-cols-13 text-sm border-b border-line hover:bg-panel transition-colors min-w-[760px]">
            <div className="col-span-1 p-3 md:p-4 text-dim">{s.tier}</div>
            <div className="col-span-3 p-3 md:p-4 font-medium truncate">{s.name}</div>
            <div className="col-span-2 p-3 md:p-4 text-dim text-[10px] tracking-widest2">{s.type.toUpperCase()}</div>
            <div className="col-span-2 p-3 md:p-4 text-dim text-[10px] tracking-widest2">{s.category?.toUpperCase()}</div>
            <div className="col-span-2 p-3 md:p-4 text-dim text-[10px] tracking-widest2">{(s.language || 'en').toUpperCase()}</div>
            <div className="col-span-1 p-3 md:p-4 text-right text-dim">{s.total_items || 0}</div>
            <div className="col-span-2 p-3 md:p-4 text-right">
              {s.runs_7d ? (
                <span className="text-[10px] font-mono">
                  <span className={s.error_rate > 30 ? 'text-[#ff3030]' : s.error_rate > 10 ? 'text-[#ffd60a]' : 'text-[#00d97e]'}>
                    {s.avg_items ?? '—'}/çekim
                  </span>
                  {s.error_rate > 0 && <span className="text-dim"> · %{s.error_rate} hata</span>}
                </span>
              ) : (
                <span className="text-[10px] text-dim">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
