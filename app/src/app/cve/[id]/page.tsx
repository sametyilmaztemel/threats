import { notFound } from 'next/navigation';
import { query } from '@/lib/db';
import Breadcrumb from '@/components/layout/Breadcrumb';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import SeverityGauge from '@/components/ui/SeverityGauge';
import CopyButton from '@/components/ui/CopyButton';
import BookmarkButton from '@/components/ui/BookmarkButton';
import { format } from '@/lib/format';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { rows } = await query<any>(`SELECT cve_id, cvss_v3, description FROM cve_enrichment WHERE cve_id=$1`, [params.id]);
  if (!rows[0]) return { title: 'CVE' };
  const c = rows[0];
  return {
    title: `${c.cve_id}${c.cvss_v3 !== null ? ` (CVSS ${c.cvss_v3})` : ''}`,
    description: (c.description || '').slice(0, 155),
  };
}

export default async function CVEPage({ params }: { params: { id: string } }) {
  const cveId = decodeURIComponent(params.id).toUpperCase();

  // Validate CVE format
  if (!/^CVE-\d{4}-\d{4,7}$/.test(cveId)) {
    notFound();
  }

  // Fetch enrichment from cache
  const enrichRes = await query<any>(
    `SELECT * FROM cve_enrichment WHERE cve_id = $1 LIMIT 1`,
    [cveId]
  );
  const enrichment = enrichRes.rows[0] || null;

  // Fetch docs mentioning this CVE
  const docsRes = await query<any>(
    `SELECT d.id, d.title, d.url, d.severity, d.published_at, d.fetched_at, d.tlp,
            s.name as source_name, dc.cvss_v3, dc.epss, dc.in_kev,
            COALESCE(d.published_at, d.fetched_at) as sort_date
     FROM documents d
     LEFT JOIN sources s ON d.source_id = s.id
     LEFT JOIN document_cves dc ON dc.document_id = d.id AND dc.cve_id = $1
     WHERE $1 = ANY(d.cves) OR dc.document_id IS NOT NULL
     ORDER BY sort_date DESC
     LIMIT 100`,
    [cveId]
  );
  const docs = docsRes.rows;

  // Fetch related CVEs (co-mentioned) — find CVEs that appear alongside this one
  const relatedRes = await query<any>(
    `WITH target_docs AS (
       SELECT id FROM documents
       WHERE $1 = ANY(cves) AND array_length(cves, 1) > 1
     )
     SELECT cve_id, COUNT(*)::int as cnt
     FROM target_docs td
     CROSS JOIN LATERAL unnest((SELECT cves FROM documents WHERE id = td.id)) AS cve_id
     WHERE cve_id != $1
     GROUP BY cve_id
     ORDER BY cnt DESC
     LIMIT 10`,
    [cveId]
  );
  const relatedCVEs = relatedRes.rows;

  const inKev = Boolean(enrichment?.in_kev) || docs.some((d: any) => d.in_kev);
  const cvss = enrichment?.cvss_v3 != null ? Number(enrichment.cvss_v3) : (docs.find((d: any) => d.cvss_v3 != null)?.cvss_v3 ?? null);
  const epss = enrichment?.epss != null ? Number(enrichment.epss) : (docs.find((d: any) => d.epss != null)?.epss ?? null);

  return (
    <div className="max-w-[1100px] mx-auto px-5 md:px-10 lg:px-12 py-6 md:py-12">
      <Breadcrumb
        items={[
          { label: '/home', href: '/' },
          { label: '/cves', href: '/cves' },
          { label: cveId },
        ]}
      />

      <PageHeader
        eyebrow="CVE PROFILE"
        title={cveId}
        subtitle={
          enrichment?.description ||
          `${docs.length} intelligence report${docs.length === 1 ? '' : 's'} reference this CVE`
        }
        actions={<div className="flex items-center gap-2"><BookmarkButton type="cve" id={cveId} title={cveId} /><CopyButton value={cveId} label="COPY CVE-ID" /></div>}
      />

      {/* Enrichment grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line mb-8 md:mb-12">
        <div className="bg-bg p-3 md:p-5">
          <div className="text-[10px] tracking-widest2 text-dim mb-2">CVSS v3</div>
          <div className="text-xl md:text-2xl font-light">{cvss != null ? String(cvss) : '—'}</div>
        </div>
        <div className="bg-bg p-3 md:p-5">
          <div className="text-[10px] tracking-widest2 text-dim mb-2">EPSS</div>
          <div className="text-xl md:text-2xl font-light">{epss != null ? `${(Number(epss) * 100).toFixed(1)}%` : '—'}</div>
        </div>
        <div className="bg-bg p-3 md:p-5">
          <div className="text-[10px] tracking-widest2 text-dim mb-2">CISA KEV</div>
          <div className="text-xl md:text-2xl font-light">{inKev ? 'YES' : 'NO'}</div>
        </div>
        <div className="bg-bg p-3 md:p-5">
          <div className="text-[10px] tracking-widest2 text-dim mb-2">DOCS</div>
          <div className="text-xl md:text-2xl font-light">{docs.length}</div>
        </div>
      </div>

      {/* Vendor/Product if known */}
      {(enrichment?.vendor || enrichment?.product) && (
        <div className="mb-8 md:mb-12 p-3 md:p-4 border border-line bg-panel">
          <div className="text-[10px] tracking-widest2 text-dim mb-2">AFFECTED PRODUCT</div>
          <div className="text-[13px] md:text-[14px] font-mono break-words">
            {enrichment.vendor && <span>{enrichment.vendor}</span>}
            {enrichment.vendor && enrichment.product && <span> · </span>}
            {enrichment.product && <span>{enrichment.product}</span>}
          </div>
        </div>
      )}

      {/* Related CVEs */}
      {relatedCVEs.length > 0 && (
        <div className="mb-8 md:mb-12">
          <div className="text-[10px] tracking-widest2 text-dim mb-4">FREQUENTLY CO-MENTIONED CVEs</div>
          <div className="flex gap-2 flex-wrap">
            {relatedCVEs.map((r: any) => (
              <a
                key={r.cve_id}
                href={`/cve/${r.cve_id}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono border border-line hover:border-fg transition-colors break-all"
              >
                {r.cve_id} <span className="text-dim">· {r.cnt}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="border-t border-line pt-6 md:pt-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-4">MENTIONED IN ({docs.length})</div>
        {docs.length === 0 ? (
          <EmptyState
            title="No mentions found"
            description={`No intelligence reports reference ${cveId} yet.`}
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
                  {d.severity && <SeverityGauge value={d.severity} size="sm" />}
                </div>
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