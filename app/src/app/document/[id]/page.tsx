import { notFound } from 'next/navigation';
import { getDocument, getRelatedDocuments, getSimilarDocuments } from '@/lib/db';
import TwoColumn from '@/components/layout/TwoColumn';
import Breadcrumb from '@/components/layout/Breadcrumb';
import TLPBadge from '@/components/ui/TLPBadge';
import SeverityGauge from '@/components/ui/SeverityGauge';
import CopyButton from '@/components/ui/CopyButton';
import BookmarkButton from '@/components/ui/BookmarkButton';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return { title: 'Document' };
  const doc = await getDocument(id);
  if (!doc) return { title: 'Document' };
  const sev = doc.severity ? ` [${doc.severity}/10]` : '';
  return {
    title: `${String(doc.title || 'Document').slice(0, 70)}${sev}`,
    description: (doc.summary || '').slice(0, 155),
  };
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

export default async function DocumentPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  const doc = await getDocument(id);
  if (!doc) notFound();

  const tierNum = String(doc.source_tier ?? '?');
  const related = await getRelatedDocuments(id, 10);
  const similar = await getSimilarDocuments(id, 6);
  // Gerçek metrik: kaynak güvenilirlik yüzdesi (tier bazlı) — uydurma değil
  const confPct = doc.confidence != null
    ? Math.round(doc.confidence * 100)
    : Math.min(95, 60 + (tierNum === '1' ? 35 : tierNum === '2' ? 25 : tierNum === '3' ? 15 : 0));

  const cats = (doc.category || []) as string[];
  const actors = (doc.actors || []) as string[];
  const cves = (doc.cves || []) as string[];
  const techs = (doc.techniques || []) as string[];
  const sectors = (doc.sectors || []) as string[];
  const iocCount = doc.ioc_count || 0;
  // FULL REPORT sadece content summary'dan belirgin uzunsa göster (duplicate önleme)
  const summaryLen = (doc.summary || '').trim().length;
  const contentLen = (doc.content || '').trim().length;
  const hasContent = contentLen > 0 && contentLen > summaryLen * 1.5;
  const hasSummary = summaryLen > 0;

  // Entity link helper
  const entityChip = (kind: string, value: string, href: string, color: string) => (
    <Link
      href={href}
      className="inline-flex items-center px-1.5 py-[2px] text-[10px] font-mono uppercase tracking-widest2 border hover:bg-fg hover:text-bg transition-colors"
      style={{ borderColor: color, color }}
    >
      {value}
    </Link>
  );

  // Build sidebar sections array — only non-empty ones
  const sidebarSections: { label: string; content: React.ReactNode }[] = [];

  if (cats.length > 0) {
    sidebarSections.push({
      label: 'CATEGORIES',
      content: (
        <div className="flex flex-wrap gap-1">
          {cats.map(c => entityChip('cat', c, `/feed?cat=${encodeURIComponent(c)}`, '#00d97e'))}
        </div>
      ),
    });
  }

  if (actors.length > 0) {
    sidebarSections.push({
      label: 'THREAT ACTORS',
      content: (
        <div className="flex flex-wrap gap-1">
          {actors.map(a => entityChip('actor', a, `/actor/${a.toLowerCase().replace(/\s+/g, '-')}`, '#ff3030'))}
        </div>
      ),
    });
  }

  if (cves.length > 0) {
    sidebarSections.push({
      label: 'CVES',
      content: (
        <div className="flex flex-wrap gap-1">
          {cves.map(c => entityChip('cve', c, `/cve/${c}`, '#ffd60a'))}
        </div>
      ),
    });
  }

  if (techs.length > 0) {
    sidebarSections.push({
      label: 'ATT&CK TECHNIQUES',
      content: (
        <div className="flex flex-wrap gap-1">
          {techs.map(t => entityChip('tech', t, `/technique/${t}`, '#ff9500'))}
        </div>
      ),
    });
  }

  if (sectors.length > 0) {
    sidebarSections.push({
      label: 'TARGET SECTORS',
      content: (
        <div className="flex flex-wrap gap-1">
          {sectors.map(s => entityChip('sec', s, `/sector/${encodeURIComponent(s)}`, '#00d97e'))}
        </div>
      ),
    });
  }

  if (iocCount > 0) {
    sidebarSections.push({
      label: 'IOCs',
      content: <div className="text-[13px] font-mono">{iocCount} <span className="text-dim text-[10px]">extracted</span></div>,
    });
  }

  if (doc.kill_chain_phase) {
    const kcColors: Record<string, string> = {
      recon: '#00d97e', weaponize: '#ffd60a', deliver: '#ff9500',
      exploit: '#ff3030', install: '#ff5c5c', c2: '#a05cff',
      actions: '#ff3860',
    };
    sidebarSections.push({
      label: 'KILL CHAIN',
      content: (
        <div
          className="text-[13px] font-mono"
          style={{ color: kcColors[String(doc.kill_chain_phase)] || '#888' }}
        >
          {String(doc.kill_chain_phase).toUpperCase()}
        </div>
      ),
    });
  }

  return (
    <TwoColumn
      left={
        <div className="space-y-0">
          {/* Hero */}
          <div className="mb-6">
            <div className="text-[10px] tracking-widest2 text-dim mb-3">INTELLIGENCE PACKAGE</div>
            <div className="flex items-center gap-2 mb-4">
              <TLPBadge tlp={doc.tlp || 'GREEN'} />
              <SeverityGauge value={doc.severity || 5} showLabel />
            </div>
            <div className="text-[11px] text-dim font-mono space-y-[3px]">
              <div>T{tierNum} · {doc.word_count || 0} words · {confPct}% trust</div>
              {doc.ai_threat && <div className="text-[#ff9500]">AI THREAT</div>}
            </div>
          </div>

          {/* Only non-empty sections */}
          {sidebarSections.map((s, i) => (
            <div key={i} className="border-t border-line py-4">
              <div className="text-[10px] tracking-widest2 text-dim mb-2">{s.label}</div>
              {s.content}
            </div>
          ))}

          {/* No intel data at all */}
          {sidebarSections.length === 0 && (
            <div className="border-t border-line py-4">
              <div className="text-[11px] text-dim italic">No entity data extracted yet.</div>
            </div>
          )}
        </div>
      }
      right={
        <article>
          <Breadcrumb
            items={[
              { label: '/home', href: '/' },
              { label: '/feed', href: '/feed' },
              { label: `/document/${doc.id}` },
            ]}
          />

          {/* Title block */}
          <div className="mb-6 md:mb-8 pb-4 md:pb-6 border-b border-line">
            <div className="text-[10px] tracking-widest2 text-dim mb-2 font-mono uppercase">{doc.source_name}</div>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-light leading-tight tracking-wider2 text-fg break-words mb-3">
              {doc.title}
            </h1>
            <div className="text-[11px] text-dim font-mono">
              {doc.author || 'Unknown'}
              {doc.published_at && <> · {fmtDate(doc.published_at)}</>}
              {doc.word_count > 0 && <> · {doc.word_count} words</>}
            </div>
            <div className="flex items-center gap-2 mt-4">
              <BookmarkButton type="document" id={doc.id} title={doc.title} />
              <CopyButton value={JSON.stringify(doc, null, 2)} label="COPY JSON" />
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] tracking-widest2 px-3 py-1 border border-line hover:bg-fg hover:text-bg transition-colors"
              >
                ORIGINAL ↗
              </a>
            </div>
          </div>

          {/* Summary */}
          {hasSummary && (
            <div className="mb-6 md:mb-8">
              <div className="text-[10px] tracking-widest2 text-dim mb-2">SUMMARY</div>
              <div className="text-[13px] md:text-[14px] leading-[1.7] text-fg">
                {doc.summary}
              </div>
            </div>
          )}

          {/* AI Summary */}
          {doc.ai_summary && doc.ai_summary.trim().length > 0 && (
            <div className="mb-6 md:mb-8">
              <div className="text-[10px] tracking-widest2 text-dim mb-2">AI SUMMARY</div>
              <div className="text-[13px] md:text-[14px] leading-[1.7] text-fg border-l-2 border-[#00d97e] pl-4">
                {doc.ai_summary}
              </div>
            </div>
          )}

          {/* Full content */}
          {hasContent && (
            <div className="mb-8 md:mb-12">
              <div className="text-[10px] tracking-widest2 text-dim mb-3">FULL REPORT</div>
              <div className="text-[13px] md:text-[14px] leading-[1.8] text-fg max-w-[680px]">
                {doc.content}
              </div>
            </div>
          )}

          {/* Related */}
          {related.length > 0 && (
            <div className="border-t border-line pt-6 md:pt-8">
              <div className="text-[10px] tracking-widest2 text-dim mb-4">RELATED INTELLIGENCE ({related.length})</div>
              <div className="space-y-1">
                {related.map((r: any) => (
                  <Link
                    key={r.id}
                    href={`/document/${r.id}`}
                    className="block p-3 border border-line hover:border-fg transition-colors group"
                  >
                    <div className="text-[13px] font-light leading-tight group-hover:text-fg break-words">{r.title}</div>
                    <div className="text-[10px] text-dim mt-1 font-mono">
                      {r.source_name} · {fmtDate(r.published_at || r.fetched_at)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Similar by content */}
          {similar.length > 0 && (
            <div className="border-t border-line pt-6 md:pt-8">
              <div className="text-[10px] tracking-widest2 text-dim mb-4">SIMILAR BY CONTENT ({similar.length})</div>
              <div className="space-y-1">
                {similar.map((r: any) => (
                  <Link
                    key={r.id}
                    href={`/document/${r.id}`}
                    className="block p-3 border border-line hover:border-fg transition-colors group"
                  >
                    <div className="text-[13px] font-light leading-tight group-hover:text-fg break-words">{r.title}</div>
                    <div className="text-[10px] text-dim mt-1 font-mono">
                      {r.source_name} · {fmtDate(r.published_at || r.fetched_at)}
                      <span className="text-[#00d97e] ml-2">{(r.sim * 100).toFixed(0)}%</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </article>
      }
    />
  );
}
