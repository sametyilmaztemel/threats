import { notFound } from 'next/navigation';
import { query } from '@/lib/db';
import Breadcrumb from '@/components/layout/Breadcrumb';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import BookmarkButton from '@/components/ui/BookmarkButton';
import { format } from '@/lib/format';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const techId = decodeURIComponent(params.id).toUpperCase();
  const { rows } = await query<any>(`SELECT name, tactic FROM techniques WHERE UPPER(attack_id)=$1 LIMIT 1`, [techId]);
  if (!rows[0]) return { title: 'Technique' };
  return { title: `${rows[0].name} (${techId})` };
}

export default async function TechniquePage({ params }: { params: { id: string } }) {
  const techId = decodeURIComponent(params.id).toUpperCase();

  // Fetch technique (schema uses attack_id, not id)
  const techRes = await query<any>(
    `SELECT * FROM techniques WHERE UPPER(attack_id) = $1 LIMIT 1`,
    [techId]
  );
  const technique = techRes.rows[0];

  // Fetch docs that mention this technique
  const docsRes = await query<any>(
    `SELECT d.id, d.title, d.url, d.severity, d.published_at, d.fetched_at,
            s.name as source_name,
            COALESCE(d.published_at, d.fetched_at) as sort_date
     FROM documents d
     LEFT JOIN sources s ON d.source_id = s.id
     WHERE $1 = ANY(d.techniques)
        OR EXISTS (
          SELECT 1 FROM document_techniques dt
          JOIN techniques t ON t.id = dt.technique_id
          WHERE dt.document_id = d.id AND UPPER(t.attack_id) = $1
        )
     ORDER BY sort_date DESC
     LIMIT 100`,
    [techId]
  );
  const docs = docsRes.rows;

  // Fetch actors that reference this technique (via ttps array)
  const actorsRes = await query<any>(
    `SELECT name, origin_country, document_count FROM actors
     WHERE EXISTS (SELECT 1 FROM unnest(ttps) t WHERE UPPER(t) = $1)
     ORDER BY document_count DESC LIMIT 15`,
    [techId]
  );
  const techniqueActors = actorsRes.rows;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <Breadcrumb
        items={[
          { label: '/home', href: '/' },
          { label: '/techniques', href: '/graph' },
          { label: techId },
        ]}
      />

      <PageHeader
        eyebrow={technique?.is_atlas ? 'MITRE ATLAS' : 'MITRE ATT&CK'}
        title={technique?.name || techId}
        subtitle={`${docs.length} intelligence report${docs.length === 1 ? '' : 's'} reference this technique`}
        actions={
          technique ? (
            <div className="flex items-center justify-end gap-3">
              <BookmarkButton type="technique" id={techId} title={technique.name || techId} />
              <div className="text-right space-y-1 text-[11px] font-mono">
                <div>ID: {techId}</div>
                {technique.tactic && <div>PHASE: {technique.tactic}</div>}
              </div>
            </div>
          ) : null
        }
      />

      {/* Description block if known */}
      {technique?.description && (
        <div className="mb-8 md:mb-12 p-3 md:p-4 border border-line bg-panel">
          <div className="text-[10px] tracking-widest2 text-dim mb-2">TECHNIQUE DESCRIPTION</div>
          <div className="text-[12px] md:text-[13px] leading-relaxed text-fg break-words">{technique.description}</div>
        </div>
      )}

      {/* Detection + Mitigation grid */}
      {(technique?.detection || technique?.mitigation) && (
        <div className="grid md:grid-cols-2 gap-px bg-line border border-line mb-8 md:mb-12">
          {technique?.detection && (
            <div className="bg-bg p-4 md:p-5">
              <div className="text-[10px] tracking-widest2 text-dim mb-2 text-[#00d97e]">DETECTION</div>
              <div className="text-[11px] md:text-[12px] leading-relaxed text-fg/90">{technique.detection}</div>
            </div>
          )}
          {technique?.mitigation && (
            <div className="bg-bg p-4 md:p-5">
              <div className="text-[10px] tracking-widest2 text-dim mb-2 text-[#ffd60a]">MITIGATION</div>
              <div className="text-[11px] md:text-[12px] leading-relaxed text-fg/90">{technique.mitigation}</div>
            </div>
          )}
        </div>
      )}

      {/* Actors using this technique */}
      {techniqueActors.length > 0 && (
        <div className="mb-8 md:mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">ACTORS USING THIS TECHNIQUE ({techniqueActors.length})</div>
          <div className="flex gap-2 flex-wrap">
            {techniqueActors.map((a: any) => (
              <a
                key={a.name}
                href={`/actor/${a.name.toLowerCase().replace(/\s+/g, '-')}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono uppercase tracking-widest2 border border-line hover:border-fg transition-colors"
              >
                {a.name}
                {a.origin_country && <span className="text-dim">· {a.origin_country}</span>}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-line pt-6 md:pt-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-4">EXAMPLES FROM CORPUS ({docs.length})</div>
        {docs.length === 0 ? (
          <EmptyState
            title="No examples yet"
            description={`No documents in our corpus reference ${techId}.`}
          />
        ) : (
          <div className="space-y-px">
            {docs.map((d: any) => (
              <a
                key={d.id}
                href={`/document/${d.id}`}
                className="block p-3 md:p-4 border-b border-line hover:bg-panel transition-colors"
              >
                <div className="text-[13px] md:text-[14px] font-light leading-tight mb-2 break-words">{d.title}</div>
                <div className="text-[10px] text-dim font-mono">
                  {d.source_name} · {format(d.published_at || d.fetched_at)}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}