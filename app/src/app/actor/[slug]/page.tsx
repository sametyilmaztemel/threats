import { notFound } from 'next/navigation';
import { query, getActorTimeline, getActorCoMentions } from '@/lib/db';
import Breadcrumb from '@/components/layout/Breadcrumb';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import TLPBadge from '@/components/ui/TLPBadge';
import SeverityGauge from '@/components/ui/SeverityGauge';
import BookmarkButton from '@/components/ui/BookmarkButton';
import { format } from '@/lib/format';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const name = params.slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  return { title: `Actor: ${name}` };
}

export default async function ActorPage({ params }: { params: { slug: string } }) {
  // slug is the actor name slugified
  const slug = decodeURIComponent(params.slug);
  const name = slug.replace(/-/g, ' ');

  // Fetch actor profile
  const actorRes = await query<any>(
    `SELECT * FROM actors WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [name]
  );
  const actor = actorRes.rows[0];

  // Fetch docs that mention this actor (via document_actors junction OR documents.actors array)
  const docsRes = await query<any>(
    `SELECT d.id, d.title, d.url, d.severity, d.published_at, d.fetched_at, d.tlp, d.confidence,
            s.name as source_name, s.tier as source_tier
     FROM documents d
     LEFT JOIN sources s ON d.source_id = s.id
     WHERE $1 = ANY(d.actors)
        OR EXISTS (
          SELECT 1 FROM document_actors da
          JOIN actors a ON a.id = da.actor_id
          WHERE da.document_id = d.id AND LOWER(a.name) = LOWER($1)
        )
     ORDER BY COALESCE(d.published_at, d.fetched_at) DESC
     LIMIT 100`,
    [name]
  );
  const docs = docsRes.rows;

  // Fetch related actors (co-mentioned — same document, doğru sorgu)
  const relatedActors = await getActorCoMentions(name, 10);

  // Actor activity timeline (last 90 days)
  const timeline = await getActorTimeline(name, 90);
  const maxTimeline = timeline.length ? Math.max(...timeline.map((t: any) => t.doc_count)) : 1;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <Breadcrumb
        items={[
          { label: '/home', href: '/' },
          { label: '/actors', href: '/actors' },
          { label: `/actor/${params.slug}` },
        ]}
      />

      <PageHeader
        eyebrow="THREAT ACTOR PROFILE"
        title={actor ? actor.name : name.toUpperCase()}
        subtitle={actor?.description || `Intelligence corpus on ${name}`}
        actions={
          actor ? (
            <div className="flex items-center justify-end gap-3">
              <BookmarkButton type="actor" id={name} title={name} />
              <div className="text-[11px] font-mono space-y-1 text-right">
                {actor.origin_country && <div>{actor.origin_country}</div>}
                {actor.first_seen && <div>First seen: {String(actor.first_seen).split('T')[0]}</div>}
              </div>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-12">
        <div className="border border-line p-3 md:p-5">
          <div className="text-[10px] tracking-widest2 text-dim mb-2">DOCUMENTS</div>
          <div className="text-2xl md:text-3xl font-light">{docs.length}</div>
        </div>
        <div className="border border-line p-3 md:p-5">
          <div className="text-[10px] tracking-widest2 text-dim mb-2">RELATED ACTORS</div>
          <div className="text-2xl md:text-3xl font-light">{relatedActors.length}</div>
        </div>
        <div className="border border-line p-3 md:p-5">
          <div className="text-[10px] tracking-widest2 text-dim mb-2">TYPE</div>
          <div className="text-[13px] md:text-[14px] font-mono mt-2 break-words">{actor?.type || '—'}</div>
        </div>
      </div>

      {/* Activity timeline */}
      {timeline.length > 0 && (
        <div className="mb-8 md:mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] tracking-widest2 text-dim">ACTIVITY · LAST 90 DAYS</div>
            <div className="text-[9px] tracking-widest text-dim">
              <span className="text-[#ff3030]">■</span> CRITICAL <span className="ml-3 text-[#00d97e]">■</span> ALL
            </div>
          </div>
          <div className="flex items-end gap-[2px] h-24 border-b border-line">
            {timeline.map((t: any) => {
              const h = Math.max(2, Math.round((t.doc_count / maxTimeline) * 96));
              const critH = t.critical > 0 ? Math.max(2, Math.round((t.critical / maxTimeline) * 96)) : 0;
              return (
                <div
                  key={t.day}
                  className="flex-1 flex items-end justify-center gap-[1px] group relative"
                  title={`${t.day}: ${t.doc_count} docs (${t.critical} critical)`}
                >
                  {critH > 0 && (
                    <div
                      className="w-1/2 bg-[#ff3030] opacity-80 transition-all group-hover:opacity-100"
                      style={{ height: `${critH}px` }}
                    />
                  )}
                  <div
                    className="w-1/2 bg-[#00d97e] opacity-60 transition-all group-hover:opacity-100"
                    style={{ height: `${h}px` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-dim mt-1 tracking-widest">
            <span>{timeline[0]?.day?.toString().slice(0, 10)}</span>
            <span>{timeline[timeline.length - 1]?.day?.toString().slice(0, 10)}</span>
          </div>
        </div>
      )}

      {/* Related actors */}
      {relatedActors.length > 0 && (
        <div className="mb-8 md:mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">FREQUENTLY CO-MENTIONED</div>
          <div className="flex gap-2 flex-wrap">
            {relatedActors.map((r: any) => (
              <a
                key={r.actor_name}
                href={`/actor/${r.actor_name.toLowerCase().replace(/\s+/g, '-')}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono uppercase tracking-widest2 border border-line hover:border-fg transition-colors break-words"
              >
                {r.actor_name} <span className="text-dim">· {r.cnt}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Techniques (TTPs) */}
      {actor?.ttps && actor.ttps.length > 0 && (
        <div className="mb-8 md:mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">TECHNIQUES ({(actor.ttps || []).length})</div>
          <div className="flex gap-2 flex-wrap">
            {actor.ttps.slice(0, 24).map((t: string) => (
              <a
                key={t}
                href={`/technique/${t}`}
                className="inline-flex items-center px-2 py-1 text-[11px] font-mono uppercase tracking-widest2 border border-line hover:border-fg transition-colors break-words max-w-full"
              >
                {t}
              </a>
            ))}
            {(actor.ttps || []).length > 24 && (
              <span className="text-[10px] text-dim self-center font-mono">+{(actor.ttps || []).length - 24} more</span>
            )}
          </div>
        </div>
      )}

      {/* Document list */}
      <div className="border-t border-line pt-6 md:pt-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-4">DOCUMENTS ({docs.length})</div>
        {docs.length === 0 ? (
          <EmptyState
            title="No documents found"
            description={`No intelligence reports mention ${name} yet.`}
          />
        ) : (
          <div className="space-y-px">
            {docs.map((d: any) => (
              <a
                key={d.id}
                href={`/document/${d.id}`}
                className="block p-3 md:p-4 border-b border-line hover:bg-panel transition-colors"
              >
                <div className="flex items-start justify-between gap-3 md:gap-4 mb-2">
                  <div className="text-[13px] md:text-[14px] font-light leading-tight flex-1 min-w-0 break-words">{d.title}</div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {d.tlp && <TLPBadge tlp={d.tlp} size="sm" />}
                    {d.severity && <SeverityGauge value={d.severity} size="sm" />}
                  </div>
                </div>
                <div className="text-[10px] text-dim font-mono">
                  {d.source_name} · T{String(d.source_tier || '').replace(/^T/, '') || '?'} ·{' '}
                  {format(d.published_at || d.fetched_at)}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}