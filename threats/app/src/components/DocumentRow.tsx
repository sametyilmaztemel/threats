import Link from 'next/link';
import { relativeTime, severityClass, severityLabel, truncate } from '@/lib/format';

export default function DocumentRow({ doc }: { doc: any }) {
  const date = doc.published_at || doc.fetched_at;
  return (
    <div className="border-b border-line hover:bg-panel transition-colors group">
      <div className="grid grid-cols-12 gap-4 p-5 items-start">
        <div className="col-span-1 text-[10px] tracking-widest2 text-dim pt-1">
          {severityLabel(doc.severity)}
        </div>
        <div className="col-span-7">
          <Link href={`/document/${doc.id}`} className="block">
            <div className={`text-[15px] leading-snug mb-1 group-hover:text-fg ${severityClass(doc.severity)}`}>
              {doc.title}
            </div>
            {doc.summary && (
              <div className="text-[11px] text-dim leading-relaxed">{truncate(doc.summary, 180)}</div>
            )}
          </Link>
          <div className="flex flex-wrap gap-1 mt-2">
            {doc.cves?.slice(0, 3).map((c: string) => (
              <span key={c} className="tag">{c}</span>
            ))}
            {doc.actors?.slice(0, 2).map((a: string) => (
              <span key={a} className="tag">{a}</span>
            ))}
            {doc.ai_threat && <span className="tag" style={{ color: '#ff9500', borderColor: '#ff9500' }}>AI</span>}
          </div>
        </div>
        <div className="col-span-2 text-[10px] tracking-widest2 text-dim pt-1 truncate">
          {doc.source_name || '—'}
        </div>
        <div className="col-span-2 text-[10px] tracking-widest2 text-dim pt-1 text-right flex flex-col items-end gap-1">
          <span>{relativeTime(date)}</span>
          <div className="flex gap-1">
            <Link
              href={`/document/${doc.id}`}
              className="text-fg hover:underline opacity-50 group-hover:opacity-100"
            >
              READ ↗
            </Link>
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-dim hover:text-fg"
            >
              ORIG
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
