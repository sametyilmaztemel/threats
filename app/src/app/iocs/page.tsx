import Link from 'next/link';
import { getIOCs, getIOCCount } from '@/lib/db';
import { relativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

const TYPES: [string, string][] = [
  ['all', 'ALL'],
  ['malicious_url', 'MALICIOUS URL'],
  ['attacker_ip', 'ATTACKER IP'],
  ['ssl_sha1', 'SSL SHA1'],
  ['phishing_url', 'PHISHING URL'],
  ['c2_ip', 'C2 IP'],
  ['domain', 'DOMAIN'],
  ['hash', 'HASH (MD5/SHA)'],
];

export default async function IOCsPage({ searchParams }: { searchParams: { type?: string; page?: string } }) {
  const type = searchParams.type || 'all';
  const page = Math.max(1, parseInt(searchParams.page || '1') || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const effectiveType = type === 'hash' ? undefined : (type === 'all' ? undefined : type);
  // hash = md5|sha1|sha256
  const hashTypes = type === 'hash' ? ['md5', 'sha1', 'sha256'] : null;
  const [iocs, total] = await Promise.all([
    getIOCs(PAGE_SIZE, effectiveType, offset, hashTypes),
    getIOCCount(effectiveType, hashTypes),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pages: number[] = [];
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, page + 2);
  for (let p = startPage; p <= endPage; p++) pages.push(p);

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <div className="mb-6 md:mb-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-1">/IOCS</div>
        <h1 className="text-2xl md:text-3xl font-light tracking-wider2">INDICATORS OF COMPROMISE</h1>
        <div className="text-[11px] text-dim font-mono mt-1">{total.toLocaleString()} indicators</div>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 mb-4 md:mb-6 text-[11px] tracking-widest2 flex-wrap">
        {TYPES.map(([t, label]) => (
          <a
            key={t}
            href={t === 'all' ? '/iocs' : `/iocs?type=${t}`}
            className={`px-3 py-1 border ${type === t ? 'border-fg text-fg' : 'border-line text-dim hover:text-fg hover:border-fg'}`}
          >
            {label}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-6">
          {page > 1 && (
            <a href={`/iocs?type=${type}&page=${page - 1}`} className="px-3 py-1.5 text-[11px] border border-line hover:bg-fg hover:text-bg transition-colors">←</a>
          )}
          {pages.map(p => (
            <a
              key={p}
              href={`/iocs?type=${type}&page=${p}`}
              className={`px-3 py-1.5 text-[11px] border transition-colors ${p === page ? 'bg-fg text-bg border-fg' : 'border-line hover:bg-fg/10'}`}
            >{p}</a>
          ))}
          {page < totalPages && (
            <a href={`/iocs?type=${type}&page=${page + 1}`} className="px-3 py-1.5 text-[11px] border border-line hover:bg-fg hover:text-bg transition-colors">→</a>
          )}
          <span className="ml-3 text-[10px] text-dim font-mono">{page}/{totalPages}</span>
        </div>
      )}
    </div>
  );
}
