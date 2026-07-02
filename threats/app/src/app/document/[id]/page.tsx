import { getDocument, getRelatedDocuments } from '@/lib/db';
import { relativeTime, severityClass, severityLabel } from '@/lib/format';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function wordCount(s: string | null | undefined): number {
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

function tagValue(s: string | null | undefined): string {
  if (!s) return '—';
  return s;
}

export default async function DocumentPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  const doc = await getDocument(id);
  if (!doc) notFound();

  const related = await getRelatedDocuments(id, 5);
  const wc = wordCount(doc.content);
  const date = doc.published_at || doc.fetched_at;
  const sev = doc.severity || 5;

  return (
    <div className="min-h-screen pb-32">
      {/* Reading progress bar */}
      <div className="fixed top-[48px] left-0 h-[2px] bg-[#ff9500] z-50" style={{ width: '0%' }} id="read-prog" />

      <article className="max-w-[900px] mx-auto px-8 pt-12">
        {/* Breadcrumb */}
        <div className="text-[10px] tracking-widest2 text-dim mb-6 flex gap-2">
          <Link href="/" className="hover:text-fg">/HOME</Link>
          <span>›</span>
          <Link href="/feed" className="hover:text-fg">/FEED</Link>
          <span>›</span>
          <span className="text-fg">/DOCUMENT/{id}</span>
        </div>

        {/* Hero */}
        <div className="mb-12">
          <h1 className={`text-3xl md:text-4xl font-light leading-tight tracking-wider2 mb-4 ${severityClass(sev)}`}>
            {doc.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-[10px] tracking-widest2 text-dim">
            <span className="text-fg">{tagValue(doc.source_name)}</span>
            {doc.source_tier && <span>T{doc.source_tier}</span>}
            {sev >= 9 && <span className="text-[#ff3030]">CRITICAL</span>}
            {sev >= 7 && sev < 9 && <span className="text-[#ff9500]">HIGH</span>}
            {doc.ai_threat && (
              <span style={{ color: '#ff9500', borderColor: '#ff9500' }} className="border px-2 py-[1px]">
                AI THREAT
              </span>
            )}
            <span>{date ? new Date(date).toISOString().slice(0, 10) : '—'}</span>
            {wc > 0 && <span>{wc} words</span>}
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg hover:underline ml-auto"
            >
              ORIGINAL ↗
            </a>
          </div>
        </div>

        {/* Intelligence Classification */}
        <div className="border border-line mb-8">
          <div className="flex items-center justify-between border-b border-line bg-panel px-5 py-3">
            <div className="flex items-center gap-2 text-[11px] tracking-widest2">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: sev >= 8 ? '#ff3030' : sev >= 5 ? '#ff9500' : '#00d77a' }} />
              INTELLIGENCE CLASSIFICATION
            </div>
            <div className="text-[10px] tracking-widest2 text-dim">
              SEV {sev}/10
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-line">
            <div className="bg-bg p-4">
              <div className="text-[10px] tracking-widest2 text-dim mb-2">CATEGORIES</div>
              <div className="flex flex-wrap gap-1">
                {doc.category?.length ? doc.category.map((c: string) => (
                  <span key={c} className="tag">{c}</span>
                )) : <span className="text-dim text-xs">—</span>}
              </div>
            </div>
            <div className="bg-bg p-4">
              <div className="text-[10px] tracking-widest2 text-dim mb-2">THREAT ACTORS</div>
              <div className="flex flex-wrap gap-1">
                {doc.actors?.length ? doc.actors.map((a: string) => (
                  <span key={a} className="tag">{a}</span>
                )) : <span className="text-dim text-xs">—</span>}
              </div>
            </div>
            <div className="bg-bg p-4">
              <div className="text-[10px] tracking-widest2 text-dim mb-2">CVEs</div>
              <div className="flex flex-wrap gap-1">
                {doc.cves?.length ? doc.cves.map((c: string) => (
                  <a key={c} href={`/cves?cve=${c}`} className="tag hover:border-fg">{c}</a>
                )) : <span className="text-dim text-xs">—</span>}
              </div>
            </div>
            <div className="bg-bg p-4">
              <div className="text-[10px] tracking-widest2 text-dim mb-2">TECHNIQUES</div>
              <div className="flex flex-wrap gap-1">
                {doc.techniques?.length ? doc.techniques.map((t: string) => (
                  <span key={t} className="tag">{t}</span>
                )) : <span className="text-dim text-xs">—</span>}
              </div>
            </div>
            <div className="bg-bg p-4">
              <div className="text-[10px] tracking-widest2 text-dim mb-2">SECTORS</div>
              <div className="flex flex-wrap gap-1">
                {doc.sectors?.length ? doc.sectors.map((s: string) => (
                  <span key={s} className="tag">{s}</span>
                )) : <span className="text-dim text-xs">—</span>}
              </div>
            </div>
            <div className="bg-bg p-4">
              <div className="text-[10px] tracking-widest2 text-dim mb-2">IOCS</div>
              <div className="text-[13px]">
                {doc.ioc_count || 0} <span className="text-dim text-[10px]">extracted</span>
              </div>
            </div>
          </div>
        </div>

        {/* Summary (Executive) */}
        {doc.summary && (
          <div className="mb-8">
            <div className="text-[10px] tracking-widest2 text-dim mb-3">EXECUTIVE SUMMARY</div>
            <div className="text-[14px] leading-relaxed text-fg border-l-2 border-line pl-5">
              {doc.summary}
            </div>
          </div>
        )}

        {/* Full Content */}
        {doc.content && doc.content !== doc.summary && (
          <div className="mb-12">
            <div className="text-[10px] tracking-widest2 text-dim mb-3">FULL REPORT</div>
            <div className="text-[13px] leading-relaxed text-fg whitespace-pre-wrap font-mono">
              {doc.content}
            </div>
          </div>
        )}

        {/* Meta Footer */}
        <div className="border-t border-line pt-6 mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px] tracking-widest2 text-dim">
          <div>
            <div className="mb-1">AUTHOR</div>
            <div className="text-fg">{tagValue(doc.author)}</div>
          </div>
          <div>
            <div className="mb-1">LANGUAGE</div>
            <div className="text-fg">{(doc.language || 'en').toUpperCase()}</div>
          </div>
          <div>
            <div className="mb-1">PUBLISHED</div>
            <div className="text-fg">{date ? new Date(date).toISOString().replace('T', ' ').slice(0, 16) : '—'}</div>
          </div>
          <div>
            <div className="mb-1">FETCHED</div>
            <div className="text-fg">{doc.fetched_at ? relativeTime(doc.fetched_at) : '—'}</div>
          </div>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-16">
            <div className="text-[10px] tracking-widest2 text-dim mb-4">RELATED INTELLIGENCE</div>
            <div className="border-t border-line">
              {related.map((r: any) => (
                <Link
                  key={r.id}
                  href={`/document/${r.id}`}
                  className="block border-b border-line hover:bg-panel transition-colors p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] tracking-widest2 ${severityClass(r.severity)} w-12`}>
                      {severityLabel(r.severity)}
                    </span>
                    <span className="text-[13px] flex-1 truncate">{r.title}</span>
                    <span className="text-[10px] tracking-widest2 text-dim">{r.source_name || '—'}</span>
                    {r.ai_threat && (
                      <span className="text-[10px]" style={{ color: '#ff9500' }}>AI</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Back link */}
        <div className="mt-12">
          <Link href="/feed" className="text-[10px] tracking-widest2 text-dim hover:text-fg">
            ← BACK TO FEED
          </Link>
        </div>
      </article>

      {/* Reading progress script */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
window.addEventListener('scroll', function() {
  const h = document.documentElement;
  const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
  const bar = document.getElementById('read-prog');
  if (bar) bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
});
          `,
        }}
      />
    </div>
  );
}
