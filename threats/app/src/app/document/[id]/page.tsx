import { notFound } from 'next/navigation';
import { getDocument, getRelatedDocuments } from '@/lib/db';
import TwoColumn from '@/components/layout/TwoColumn';
import Breadcrumb from '@/components/layout/Breadcrumb';
import PageHeader from '@/components/layout/PageHeader';
import RelatedEntities from '@/components/layout/RelatedEntities';
import TLPBadge from '@/components/ui/TLPBadge';
import SeverityGauge from '@/components/ui/SeverityGauge';
import CopyButton from '@/components/ui/CopyButton';

export const dynamic = 'force-dynamic';

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().split('T')[0];
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-3">
      <div className="text-[10px] tracking-widest2 text-dim mb-2 break-words">{label}</div>
      {children}
    </div>
  );
}

export default async function DocumentPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  const doc = await getDocument(id);
  if (!doc) notFound();

  // Source tier is smallint (1/2/3) in DB; coerce to string for display
  const tierNum = String(doc.source_tier ?? '?');

  const related = await getRelatedDocuments(id, 10);

  return (
    <TwoColumn
      left={
        <div className="space-y-4">
          {/* Hero */}
          <div>
            <div className="text-[10px] tracking-widest2 text-dim mb-2">INTELLIGENCE PACKAGE</div>
            <div className="flex items-center gap-2 mb-3">
              <TLPBadge tlp={doc.tlp || 'GREEN'} />
              <SeverityGauge value={doc.severity || 5} showLabel />
            </div>
            <div className="text-[11px] text-dim space-y-1 font-mono">
              <div>T{tierNum} · {doc.word_count || '—'} words</div>
              <div>{Math.round((doc.confidence || 0) * 100)}% confidence</div>
              {doc.kill_chain_phase && <div>PHASE: {String(doc.kill_chain_phase).toUpperCase()}</div>}
            </div>
          </div>

          {/* Categories */}
          <SidebarSection label="CATEGORIES">
            {(doc.category || []).length === 0 ? (
              <span className="text-dim text-xs">—</span>
            ) : (
              <RelatedEntities
                items={(doc.category || []).map((c: string) => ({ kind: 'sector', value: c, display: c }))}
              />
            )}
          </SidebarSection>

          {/* Threat Actors */}
          <SidebarSection label="THREAT ACTORS">
            {(doc.actors || []).length === 0 ? (
              <span className="text-dim text-xs">—</span>
            ) : (
              <RelatedEntities
                items={(doc.actors || []).map((a: string) => ({ kind: 'actor', value: a, display: a }))}
              />
            )}
          </SidebarSection>

          {/* CVEs */}
          <SidebarSection label="CVEs">
            {(doc.cves || []).length === 0 ? (
              <span className="text-dim text-xs">—</span>
            ) : (
              <RelatedEntities
                items={(doc.cves || []).map((c: string) => ({ kind: 'cve', value: c, display: c }))}
              />
            )}
          </SidebarSection>

          {/* MITRE ATT&CK */}
          <SidebarSection label="ATT&CK TECHNIQUES">
            {(doc.techniques || []).length === 0 ? (
              <span className="text-dim text-xs">—</span>
            ) : (
              <RelatedEntities
                items={(doc.techniques || []).map((t: string) => ({ kind: 'technique', value: t, display: t }))}
              />
            )}
          </SidebarSection>

          {/* Sectors */}
          <SidebarSection label="TARGET SECTORS">
            {(doc.sectors || []).length === 0 ? (
              <span className="text-dim text-xs">—</span>
            ) : (
              <RelatedEntities
                items={(doc.sectors || []).map((s: string) => ({ kind: 'sector', value: s, display: s }))}
              />
            )}
          </SidebarSection>

          {/* IOCs */}
          <SidebarSection label="IOCs">
            <div className="text-[13px]">
              {doc.ioc_count || 0} <span className="text-dim text-[10px]">extracted</span>
            </div>
          </SidebarSection>

          {/* Languages */}
          <SidebarSection label="LANGUAGE">
            <div className="text-[13px]">{(doc.language || 'en').toUpperCase()}</div>
          </SidebarSection>
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

          <PageHeader
            eyebrow={doc.source_name}
            title={doc.title}
            subtitle={`${doc.author || 'Unknown'} · ${formatDate(doc.published_at || doc.fetched_at)}`}
            actions={
              <div className="flex items-center gap-2">
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
            }
          />

          {/* AI Summary if exists */}
          {doc.ai_summary && (
            <div className="mb-8 border border-line p-3 md:p-5 bg-panel">
              <div className="text-[10px] tracking-widest2 text-dim mb-2">AI SUMMARY · LLM-GENERATED</div>
              <div className="text-[13px] md:text-[14px] leading-relaxed text-fg">{doc.ai_summary}</div>
            </div>
          )}

          {/* Executive Summary */}
          {doc.summary && !doc.ai_summary && (
            <div className="mb-8">
              <div className="text-[10px] tracking-widest2 text-dim mb-3">EXECUTIVE SUMMARY</div>
              <div className="text-[13px] md:text-[14px] leading-relaxed text-fg border-l-2 border-line pl-3 md:pl-5">
                {doc.summary}
              </div>
            </div>
          )}

          {/* Full Report */}
          {doc.content && doc.content !== doc.summary && (
            <div className="mb-8 md:mb-12">
              <div className="text-[10px] tracking-widest2 text-dim mb-3">FULL REPORT</div>
              <div className="text-[12px] md:text-[13px] leading-relaxed text-fg whitespace-pre-wrap font-mono overflow-x-auto">
                {doc.content}
              </div>
            </div>
          )}

          {/* Related Documents */}
          {related.length > 0 && (
            <div className="border-t border-line pt-6 md:pt-8">
              <div className="text-[10px] tracking-widest2 text-dim mb-4">RELATED INTELLIGENCE</div>
              <div className="space-y-2">
                {related.map((r: any) => (
                  <a
                    key={r.id}
                    href={`/document/${r.id}`}
                    className="block p-3 border border-line hover:border-fg transition-colors"
                  >
                    <div className="text-[12px] font-mono break-words">{r.title}</div>
                    <div className="text-[10px] text-dim mt-1">
                      {r.source_name} · {formatDate(r.published_at || r.fetched_at)}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </article>
      }
    />
  );
}