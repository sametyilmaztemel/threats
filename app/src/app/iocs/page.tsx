import Link from 'next/link';
import { getIOCs } from '@/lib/db';
import { relativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function IOCsPage({ searchParams }: { searchParams: { type?: string } }) {
  const type = searchParams.type;
  const iocs = await getIOCs(200, type);

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <div className="mb-6 md:mb-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-1">/IOCS</div>
        <h1 className="text-2xl md:text-3xl font-light tracking-wider2">INDICATORS OF COMPROMISE</h1>
      </div>
      <div className="flex gap-2 mb-4 md:mb-6 text-[11px] tracking-widest2 flex-wrap">
        {['all', 'attacker_ip', 'c2_ip', 'malicious_url', 'phishing_url', 'ssl_sha1'].map(t => (
          <a
            key={t}
            href={t === 'all' ? '/iocs' : `/iocs?type=${t}`}
            className={`px-3 py-1 border ${(type || 'all') === t ? 'border-fg text-fg' : 'border-line text-dim hover:text-fg hover:border-fg'}`}
          >
            {t.toUpperCase().replace('_', ' ')}
          </a>
        ))}
      </div>
      <div className="border border-line overflow-x-auto">
        <div className="grid grid-cols-12 text-[10px] tracking-widest2 text-dim border-b border-line bg-panel min-w-[800px]">
          <div className="col-span-6 p-3 md:p-4">VALUE</div>
          <div className="col-span-2 p-3 md:p-4">TYPE</div>
          <div className="col-span-2 p-3 md:p-4">SOURCE</div>
          <div className="col-span-2 p-3 md:p-4 text-right">FIRST SEEN</div>
        </div>
        {iocs.length === 0 ? (
          <div className="p-8 md:p-12 text-center text-dim text-sm">No IOCs ingested yet.</div>
        ) : iocs.map((i: any) => (
          <Link
            key={i.id}
            href={`/ioc/${i.id}`}
            className="grid grid-cols-12 text-[12px] border-b border-line hover:bg-panel transition-colors min-w-[800px]"
          >
            <div className="col-span-6 p-3 md:p-4 font-mono truncate">{i.value}</div>
            <div className="col-span-2 p-3 md:p-4 text-dim text-[10px] tracking-widest2">{i.type.toUpperCase().replace('_', ' ')}</div>
            <div className="col-span-2 p-3 md:p-4 text-dim text-[10px] truncate">{i.source_name || '—'}</div>
            <div className="col-span-2 p-3 md:p-4 text-right text-dim text-[10px]">{relativeTime(i.first_seen)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
