import { getActors } from '@/lib/db';

export const revalidate = 300; // ISR 5dk cache

const TYPES = ['all', 'apt', 'ransomware-gang', 'financially-motivated', 'hacktivist', 'insider'];

function actorSlug(name: string): string {
  return encodeURIComponent(name);
}

export default async function ActorsPage({ searchParams }: { searchParams: { type?: string } }) {
  const type = searchParams.type || 'all';
  const all = await getActors(500);
  const actors = type === 'all' ? all : all.filter((a: any) => a.type === type);

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <div className="mb-6 md:mb-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-1">/ACTORS</div>
        <h1 className="text-2xl md:text-3xl font-light tracking-wider2">THREAT ACTORS <span className="terminal-cursor" /></h1>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 mb-4 md:mb-6 text-[11px] tracking-widest2 flex-wrap">
        {TYPES.map(t => (
          <a
            key={t}
            href={t === 'all' ? '/actors' : `/actors?type=${t}`}
            className={`px-3 py-1 border ${type === t ? 'border-fg text-fg' : 'border-line text-dim hover:text-fg hover:border-fg'}`}
          >
            {t.toUpperCase()}
          </a>
        ))}
      </div>

      <div className="border border-line overflow-x-auto">
        <div className="grid grid-cols-12 text-[10px] tracking-widest2 text-dim border-b border-line bg-panel min-w-[700px]">
          <div className="col-span-3 p-3 md:p-4">NAME</div>
          <div className="col-span-2 p-3 md:p-4">TYPE</div>
          <div className="col-span-5 p-3 md:p-4">TARGETS / TTPs</div>
          <div className="col-span-2 p-3 md:p-4 text-right">DOCS</div>
        </div>
        {actors.map((a: any) => (
          <a key={a.id} href={`/actor/${actorSlug(a.name)}`} className="grid grid-cols-12 text-sm border-b border-line hover:bg-panel transition-colors min-w-[700px]">
            <div className="col-span-3 p-3 md:p-4 font-medium break-words hover:text-high">{a.name}</div>
            <div className="col-span-2 p-3 md:p-4 text-dim text-[11px] tracking-widest2">{a.type?.toUpperCase() || '—'}</div>
            <div className="col-span-5 p-3 md:p-4 flex flex-wrap gap-1">
              {(a.targets || []).slice(0, 6).map((t: string) => <span key={t} className="tag">{t}</span>)}
              {(a.ttps || []).slice(0, 3).map((t: string) => <span key={t} className="tag">{t}</span>)}
            </div>
            <div className="col-span-2 p-3 md:p-4 text-right text-dim">{a.document_count}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
