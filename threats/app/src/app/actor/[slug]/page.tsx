import { notFound } from 'next/navigation';
import { query } from '@/lib/db';
import Breadcrumb from '@/components/layout/Breadcrumb';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import TLPBadge from '@/components/ui/TLPBadge';
import SeverityGauge from '@/components/ui/SeverityGauge';
import { format } from '@/lib/format';

export const dynamic = 'force-dynamic';

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

  // Fetch related actors (co-mentioned)
  const relatedRes = await query<any>(
    `SELECT actor_name, COUNT(*)::int as cnt FROM (
       SELECT unnest(d2.actors) as actor_name
       FROM documents d1
       JOIN documents d2 ON d2.id != d1.id
       WHERE ($1 = ANY(d1.actors)
              OR EXISTS (
                SELECT 1 FROM document_actors da
                JOIN actors a ON a.id = da.actor_id
                WHERE da.document_id = d1.id AND LOWER(a.name) = LOWER($1)
              ))
         AND d2.actors IS NOT NULL
     ) sub
     WHERE actor_name IS NOT NULL AND actor_name != $1
     GROUP BY actor_name
     ORDER BY cnt DESC
     LIMIT 10`,
    [name]
  );
  const relatedActors = relatedRes.rows;

  return (
    <div className="max-w-[1400px] mx-auto px-8 py-12">
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
            <div className="text-[11px] font-mono space-y-1 text-right">
              {actor.origin_country && <div>{actor.origin_country}</div>}
              {actor.first_seen && <div>First seen: {String(actor.first_seen).split('T')[0]}</div>}
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
        <div className="border border-line p-5">
          <div className="text-[10px] tracking-widest2 text-dim mb-2">DOCUMENTS</div>
          <div className="text-3xl font-light">{docs.length}</div>
        </div>
        <div className="border border-line p-5">
          <div className="text-[10px] tracking-widest2 text-dim mb-2">RELATED ACTORS</div>
          <div className="text-3xl font-light">{relatedActors.length}</div>
        </div>
        <div className="border border-line p-5">
          <div className="text-[10px] tracking-widest2 text-dim mb-2">TYPE</div>
          <div className="text-[14px] font-mono mt-2">{actor?.type || '—'}</div>
        </div>
      </div>

      {/* Related actors */}
      {relatedActors.length > 0 && (
        <div className="mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">FREQUENTLY CO-MENTIONED</div>
          <div className="flex gap-2 flex-wrap">
            {relatedActors.map((r: any) => (
              <a
                key={r.actor_name}
                href={`/actor/${r.actor_name.toLowerCase().replace(/\s+/g, '-')}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono uppercase tracking-widest2 border border-line hover:border-fg transition-colors"
              >
                {r.actor_name} <span className="text-dim">· {r.cnt}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Document list */}
      <div className="border-t border-line pt-8">
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
                className="block p-4 border-b border-line hover:bg-panel transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="text-[14px] font-light leading-tight flex-1">{d.title}</div>
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