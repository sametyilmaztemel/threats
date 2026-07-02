import { getSources } from '@/lib/db';
import { relativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function SourcesPage() {
  const sources = await getSources();
  return (
    <div className="max-w-[1400px] mx-auto px-8 py-12">
      <div className="mb-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-1">/SOURCES</div>
        <h1 className="text-3xl font-light tracking-wider2">SOURCES <span className="terminal-cursor" /></h1>
        <p className="text-xs text-dim mt-2">{sources.length} configured · {sources.filter(s => s.enabled).length} active</p>
      </div>
      <div className="border border-line">
        <div className="grid grid-cols-12 text-[10px] tracking-widest2 text-dim border-b border-line bg-panel">
          <div className="col-span-1 p-4">T</div>
          <div className="col-span-3 p-4">NAME</div>
          <div className="col-span-2 p-4">TYPE</div>
          <div className="col-span-2 p-4">CATEGORY</div>
          <div className="col-span-2 p-4">LANG</div>
          <div className="col-span-2 p-4 text-right">ITEMS</div>
        </div>
        {sources.map((s: any) => (
          <div key={s.id} className="grid grid-cols-12 text-sm border-b border-line hover:bg-panel transition-colors">
            <div className="col-span-1 p-4 text-dim">{s.tier}</div>
            <div className="col-span-3 p-4 font-medium truncate">{s.name}</div>
            <div className="col-span-2 p-4 text-dim text-[10px] tracking-widest2">{s.type.toUpperCase()}</div>
            <div className="col-span-2 p-4 text-dim text-[10px] tracking-widest2">{s.category?.toUpperCase()}</div>
            <div className="col-span-2 p-4 text-dim text-[10px] tracking-widest2">{(s.language || 'en').toUpperCase()}</div>
            <div className="col-span-2 p-4 text-right text-dim">{s.total_items || 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
