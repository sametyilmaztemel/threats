import { query } from '@/lib/db';
import Link from 'next/link';
import FacetRail from '@/components/ui/FacetRail';
import SearchBar from '@/components/ui/SearchBar';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import TLPBadge from '@/components/ui/TLPBadge';
import SeverityGauge from '@/components/ui/SeverityGauge';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const SEVERITY_MAP: Record<string, number> = {
  critical: 9,
  high: 7,
  medium: 5,
  low: 1,
};

// Upper bounds for each severity bucket (exclusive).
// critical: >=9 (no upper), high: 7-8, medium: 5-6, low: 1-4
const SEVERITY_BUCKET_UPPER: Record<number, number> = {
  1: 5,
  5: 7,
  7: 9,
  9: 11, // exclusive upper = 11, equivalent to >= 9 in 1-10 range
};

// Multi-value param: "critical,high" → [9, 7]
// Single-value param: "critical" → [9]
function severityValues(s: string | undefined): number[] {
  if (!s) return [];
  return s
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v in SEVERITY_MAP)
    .map((v) => SEVERITY_MAP[v])
    .filter((v, i, arr) => arr.indexOf(v) === i) // dedupe
    .sort((a, b) => a - b);
}

function splitCsv(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

interface SearchParams {
  q?: string;
  sev?: string;
  cat?: string;
  actor?: string;
  cve?: string;
  source?: string;
  tlp?: string;
  ai?: string;
  page?: string;
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const page = Math.max(1, parseInt(searchParams.page || '1') || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Build WHERE clause + params
  const conditions: string[] = [];
  const params: any[] = [];
  let pIdx = 1;

  if (searchParams.q && searchParams.q.trim()) {
    conditions.push(`(d.title ILIKE $${pIdx} OR d.content ILIKE $${pIdx})`);
    params.push(`%${searchParams.q.trim()}%`);
    pIdx++;
  }

  const sevVals = severityValues(searchParams.sev);
  if (sevVals.length > 0) {
    // Map values are LOWER BOUNDS for buckets:
    // critical: 9-10, high: 7-8, medium: 5-6, low: 1-4
    // For a single bucket use >= lower. For multiple selected buckets,
    // OR together half-open ranges covering each bucket.
    const ranges = sevVals.map((lower) => {
      const upper = SEVERITY_BUCKET_UPPER[lower] ?? 11;
      return { lower, upper };
    });
    const parts: string[] = [];
    for (const { lower, upper } of ranges) {
      if (upper >= 11) {
        // open-ended top bucket: >= lower
        parts.push(`d.severity >= $${pIdx++}`);
        params.push(lower);
      } else {
        // half-open: [lower, upper)
        parts.push(
          `(d.severity >= $${pIdx++} AND d.severity < $${pIdx++})`
        );
        params.push(lower, upper);
      }
    }
    conditions.push('(' + parts.join(' OR ') + ')');
  }

  const catVals = splitCsv(searchParams.cat);
  if (catVals.length === 1) {
    conditions.push(`$${pIdx} = ANY(d.category)`);
    params.push(catVals[0]);
    pIdx++;
  } else if (catVals.length > 1) {
    // Multi-value: match any of them
    const placeholders = catVals.map(() => `$${pIdx++}`).join(',');
    conditions.push(`(d.category && ARRAY[${placeholders}]::text[])`);
    params.push(...catVals);
  }

  const actorVals = splitCsv(searchParams.actor);
  if (actorVals.length === 1) {
    conditions.push(`$${pIdx} = ANY(d.actors)`);
    params.push(actorVals[0]);
    pIdx++;
  } else if (actorVals.length > 1) {
    const placeholders = actorVals.map(() => `$${pIdx++}`).join(',');
    conditions.push(`(d.actors && ARRAY[${placeholders}]::text[])`);
    params.push(...actorVals);
  }

  const cveVals = splitCsv(searchParams.cve);
  if (cveVals.length === 1) {
    conditions.push(`$${pIdx} = ANY(d.cves)`);
    params.push(cveVals[0]);
    pIdx++;
  } else if (cveVals.length > 1) {
    const placeholders = cveVals.map(() => `$${pIdx++}`).join(',');
    conditions.push(`(d.cves && ARRAY[${placeholders}]::text[])`);
    params.push(...cveVals);
  }

  if (searchParams.source && searchParams.source.trim()) {
    conditions.push(`s.name ILIKE $${pIdx}`);
    params.push(`%${searchParams.source.trim()}%`);
    pIdx++;
  }

  const tlpVals = splitCsv(searchParams.tlp).map((t) => t.toUpperCase());
  if (tlpVals.length === 1) {
    conditions.push(`d.tlp = $${pIdx}`);
    params.push(tlpVals[0]);
    pIdx++;
  } else if (tlpVals.length > 1) {
    const placeholders = tlpVals.map(() => `$${pIdx++}`).join(',');
    conditions.push(`d.tlp IN (${placeholders})`);
    params.push(...tlpVals);
  }

  if (searchParams.ai === 'true') {
    conditions.push(`d.ai_threat = TRUE`);
  } else if (searchParams.ai === 'false') {
    conditions.push(`d.ai_threat = FALSE`);
  }

  const whereClause =
    conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  // ---------- main docs query ----------
  const countQuery = `
    SELECT COUNT(*)::int as total
    FROM documents d
    LEFT JOIN sources s ON d.source_id = s.id
    ${whereClause}
  `;
  const countResult = await query<{ total: number }>(countQuery, params);
  const total = countResult.rows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const docsQuery = `
    SELECT d.id, d.title, d.url, d.summary, d.author, d.published_at,
           d.fetched_at, d.severity, d.category, d.cves, d.actors,
           d.techniques, d.ai_threat, d.tlp, d.word_count,
           d.content,
           s.name as source_name, s.tier as source_tier
    FROM documents d
    LEFT JOIN sources s ON d.source_id = s.id
    ${whereClause}
    ORDER BY COALESCE(d.published_at, d.fetched_at) DESC
    LIMIT $${pIdx} OFFSET $${pIdx + 1}
  `;
  const docsResult = await query<any>(docsQuery, [
    ...params,
    PAGE_SIZE,
    offset,
  ]);
  const docs = docsResult.rows;

  // ---------- facet counts (each facet excludes itself) ----------
  // We rebuild per-facet conditions inline to keep param indices clean.
  function buildFacetWhere(exclude: string): {
    where: string;
    p: any[];
  } {
    const cs: string[] = [];
    const ps: any[] = [];
    let i = 1;
    if (searchParams.q && searchParams.q.trim() && exclude !== 'q') {
      cs.push(`(d.title ILIKE $${i} OR d.content ILIKE $${i})`);
      ps.push(`%${searchParams.q.trim()}%`);
      i++;
    }
    if (exclude !== 'sev') {
      const v = severityValues(searchParams.sev);
      if (v.length > 0) {
        const parts: string[] = [];
        for (const lower of v) {
          const upper = SEVERITY_BUCKET_UPPER[lower] ?? 11;
          if (upper >= 11) {
            parts.push(`d.severity >= $${i++}`);
            ps.push(lower);
          } else {
            parts.push(
              `(d.severity >= $${i++} AND d.severity < $${i++})`
            );
            ps.push(lower, upper);
          }
        }
        cs.push('(' + parts.join(' OR ') + ')');
      }
    }
    if (exclude !== 'cat') {
      const v = splitCsv(searchParams.cat);
      if (v.length === 1) {
        cs.push(`$${i} = ANY(d.category)`);
        ps.push(v[0]);
        i++;
      } else if (v.length > 1) {
        const ph = v.map(() => `$${i++}`).join(',');
        cs.push(`(d.category && ARRAY[${ph}]::text[])`);
        ps.push(...v);
      }
    }
    if (exclude !== 'actor') {
      const v = splitCsv(searchParams.actor);
      if (v.length === 1) {
        cs.push(`$${i} = ANY(d.actors)`);
        ps.push(v[0]);
        i++;
      } else if (v.length > 1) {
        const ph = v.map(() => `$${i++}`).join(',');
        cs.push(`(d.actors && ARRAY[${ph}]::text[])`);
        ps.push(...v);
      }
    }
    if (exclude !== 'cve') {
      const v = splitCsv(searchParams.cve);
      if (v.length === 1) {
        cs.push(`$${i} = ANY(d.cves)`);
        ps.push(v[0]);
        i++;
      } else if (v.length > 1) {
        const ph = v.map(() => `$${i++}`).join(',');
        cs.push(`(d.cves && ARRAY[${ph}]::text[])`);
        ps.push(...v);
      }
    }
    if (
      searchParams.source &&
      searchParams.source.trim() &&
      exclude !== 'source'
    ) {
      cs.push(`s.name ILIKE $${i}`);
      ps.push(`%${searchParams.source.trim()}%`);
      i++;
    }
    if (exclude !== 'tlp') {
      const v = splitCsv(searchParams.tlp).map((t) => t.toUpperCase());
      if (v.length === 1) {
        cs.push(`d.tlp = $${i}`);
        ps.push(v[0]);
        i++;
      } else if (v.length > 1) {
        const ph = v.map(() => `$${i++}`).join(',');
        cs.push(`d.tlp IN (${ph})`);
        ps.push(...v);
      }
    }
    if (exclude !== 'ai') {
      if (searchParams.ai === 'true') cs.push(`d.ai_threat = TRUE`);
      else if (searchParams.ai === 'false') cs.push(`d.ai_threat = FALSE`);
    }
    return {
      where: cs.length > 0 ? 'WHERE ' + cs.join(' AND ') : '',
      p: ps,
    };
  }

  const selectedSet = {
    sev: new Set(splitCsv(searchParams.sev).map((s) => s.toLowerCase())),
    cat: new Set(splitCsv(searchParams.cat)),
    actor: new Set(splitCsv(searchParams.actor)),
    cve: new Set(splitCsv(searchParams.cve)),
    source: new Set(splitCsv(searchParams.source)),
    tlp: new Set(splitCsv(searchParams.tlp).map((t) => t.toUpperCase())),
    ai: searchParams.ai === 'true' || searchParams.ai === 'false'
      ? new Set([searchParams.ai])
      : new Set<string>(),
  };

  // ---- category facets ----
  const catW = buildFacetWhere('cat');
  const catFacetResult = await query<{ value: string; count: string }>(
    `SELECT unnest(d.category) as value, COUNT(*)::int as count
     FROM documents d LEFT JOIN sources s ON d.source_id = s.id
     ${catW.where}
     GROUP BY value ORDER BY count DESC LIMIT 15`,
    catW.p
  );

  // ---- severity facets (always all 4 buckets) ----
  const sevW = buildFacetWhere('sev');
  const sevFacetResult = await query<{
    critical: string;
    high: string;
    medium: string;
    low: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE d.severity >= 9)::int as critical,
       COUNT(*) FILTER (WHERE d.severity >= 7 AND d.severity < 9)::int as high,
       COUNT(*) FILTER (WHERE d.severity >= 5 AND d.severity < 7)::int as medium,
       COUNT(*) FILTER (WHERE d.severity < 5)::int as low
     FROM documents d LEFT JOIN sources s ON d.source_id = s.id
     ${sevW.where}`,
    sevW.p
  );

  // ---- actor facets ----
  const actorW = buildFacetWhere('actor');
  const actorFacetResult = await query<{ value: string; count: string }>(
    `SELECT unnest(d.actors) as value, COUNT(*)::int as count
     FROM documents d LEFT JOIN sources s ON d.source_id = s.id
     ${actorW.where}
     GROUP BY value HAVING COUNT(*) > 0 ORDER BY count DESC LIMIT 15`,
    actorW.p
  );

  // ---- source facets ----
  const sourceW = buildFacetWhere('source');
  const sourceFacetResult = await query<{ value: string; count: string }>(
    `SELECT s.name as value, COUNT(*)::int as count
     FROM documents d LEFT JOIN sources s ON d.source_id = s.id
     ${sourceW.where}
     GROUP BY s.name HAVING COUNT(*) > 0 ORDER BY count DESC LIMIT 15`,
    sourceW.p
  );

  // ---- TLP facets ----
  const tlpW = buildFacetWhere('tlp');
  const tlpFacetResult = await query<{ value: string; count: string }>(
    `SELECT d.tlp as value, COUNT(*)::int as count
     FROM documents d LEFT JOIN sources s ON d.source_id = s.id
     ${tlpW.where}
     GROUP BY d.tlp ORDER BY count DESC`,
    tlpW.p
  );

  // ---- AI threat facets ----
  const aiW = buildFacetWhere('ai');
  const aiFacetResult = await query<{ ai: string; non_ai: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE d.ai_threat = TRUE)::int as ai,
       COUNT(*) FILTER (WHERE d.ai_threat = FALSE)::int as non_ai
     FROM documents d LEFT JOIN sources s ON d.source_id = s.id
     ${aiW.where}`,
    aiW.p
  );

  // ---- CVE facets ----
  const cveW = buildFacetWhere('cve');
  const cveFacetResult = await query<{ value: string; count: string }>(
    `SELECT unnest(d.cves) as value, COUNT(*)::int as count
     FROM documents d LEFT JOIN sources s ON d.source_id = s.id
     ${cveW.where}
     GROUP BY value HAVING COUNT(*) > 0 ORDER BY count DESC LIMIT 15`,
    cveW.p
  );

  const sevCounts = sevFacetResult.rows[0] || ({} as any);
  const aiCounts = aiFacetResult.rows[0] || ({} as any);

  const facets = [
    {
      name: 'sev',
      label: 'SEVERITY',
      values: [
        {
          value: 'critical',
          label: 'Critical (9-10)',
          count: Number(sevCounts.critical ?? 0),
          selected: selectedSet.sev.has('critical'),
        },
        {
          value: 'high',
          label: 'High (7-8)',
          count: Number(sevCounts.high ?? 0),
          selected: selectedSet.sev.has('high'),
        },
        {
          value: 'medium',
          label: 'Medium (5-6)',
          count: Number(sevCounts.medium ?? 0),
          selected: selectedSet.sev.has('medium'),
        },
        {
          value: 'low',
          label: 'Low (1-4)',
          count: Number(sevCounts.low ?? 0),
          selected: selectedSet.sev.has('low'),
        },
      ],
    },
    {
      name: 'ai',
      label: 'AI THREAT',
      values: [
        {
          value: 'true',
          label: 'Yes',
          count: Number(aiCounts.ai ?? 0),
          selected: selectedSet.ai.has('true'),
        },
        {
          value: 'false',
          label: 'No',
          count: Number(aiCounts.non_ai ?? 0),
          selected: selectedSet.ai.has('false'),
        },
      ],
    },
    {
      name: 'cat',
      label: 'CATEGORY',
      values: catFacetResult.rows.map((r) => ({
        value: r.value,
        label: r.value,
        count: Number(r.count),
        selected: selectedSet.cat.has(r.value),
      })),
    },
    {
      name: 'actor',
      label: 'ACTOR',
      values: actorFacetResult.rows.map((r) => ({
        value: r.value,
        label: r.value,
        count: Number(r.count),
        selected: selectedSet.actor.has(r.value),
      })),
    },
    {
      name: 'cve',
      label: 'CVE',
      values: cveFacetResult.rows.map((r) => ({
        value: r.value,
        label: r.value,
        count: Number(r.count),
        selected: selectedSet.cve.has(r.value),
      })),
    },
    {
      name: 'source',
      label: 'SOURCE',
      values: sourceFacetResult.rows.map((r) => ({
        value: r.value,
        label: r.value,
        count: Number(r.count),
        selected: selectedSet.source.has(r.value),
      })),
    },
    {
      name: 'tlp',
      label: 'TLP',
      values: tlpFacetResult.rows
        .filter((r) => r.value)
        .map((r) => ({
          value: r.value,
          label: r.value,
          count: Number(r.count),
          selected: selectedSet.tlp.has(r.value),
        })),
    },
  ].filter(f => f.values.length > 0);

  const hasActiveFilters =
    !!searchParams.sev ||
    !!searchParams.cat ||
    !!searchParams.actor ||
    !!searchParams.cve ||
    !!searchParams.source ||
    !!searchParams.tlp ||
    !!searchParams.ai;

  const hasAnyFilter = hasActiveFilters || !!searchParams.q;

  // Build pagination URL preserving all current params
  const buildPageUrl = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(searchParams).forEach(([k, v]) => {
      if (k === 'page') return;
      if (v) sp.set(k, String(v));
    });
    if (p > 1) sp.set('page', String(p));
    const qs = sp.toString();
    return `/feed${qs ? `?${qs}` : ''}`;
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <PageHeader
        eyebrow="THREAT INTELLIGENCE FEED"
        title={`${total.toLocaleString()} ${total === 1 ? 'report' : 'reports'}`}
        subtitle={
          hasAnyFilter ? 'Filtered results' : 'Latest from 70+ sources'
        }
      />

      <div className="mb-6">
        <SearchBar
          defaultValue={searchParams.q || ''}
          placeholder="Search title or content... (+required -excluded)"
          autoFocus={false}
        />
      </div>

      {hasActiveFilters && (
        <div className="mb-6 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] tracking-widest2 text-dim">
            ACTIVE FILTERS:
          </span>
          {searchParams.sev && (
            <Link
              href={`/feed?${buildFilterUrl(searchParams, { sev: null })}`}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] tracking-widest2 border border-line hover:border-fg"
            >
              sev:{searchParams.sev} ✕
            </Link>
          )}
          {searchParams.cat && (
            <Link
              href={`/feed?${buildFilterUrl(searchParams, { cat: null })}`}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] tracking-widest2 border border-line hover:border-fg"
            >
              cat:{searchParams.cat} ✕
            </Link>
          )}
          {searchParams.actor && (
            <Link
              href={`/feed?${buildFilterUrl(searchParams, { actor: null })}`}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] tracking-widest2 border border-line hover:border-fg"
            >
              actor:{searchParams.actor} ✕
            </Link>
          )}
          {searchParams.cve && (
            <Link
              href={`/feed?${buildFilterUrl(searchParams, { cve: null })}`}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] tracking-widest2 border border-line hover:border-fg"
            >
              cve:{searchParams.cve} ✕
            </Link>
          )}
          {searchParams.source && (
            <Link
              href={`/feed?${buildFilterUrl(searchParams, { source: null })}`}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] tracking-widest2 border border-line hover:border-fg"
            >
              source:{searchParams.source} ✕
            </Link>
          )}
          {searchParams.tlp && (
            <Link
              href={`/feed?${buildFilterUrl(searchParams, { tlp: null })}`}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] tracking-widest2 border border-line hover:border-fg"
            >
              tlp:{searchParams.tlp} ✕
            </Link>
          )}
          {searchParams.ai && (
            <Link
              href={`/feed?${buildFilterUrl(searchParams, { ai: null })}`}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] tracking-widest2 border border-line hover:border-fg"
            >
              ai:{searchParams.ai} ✕
            </Link>
          )}
          <Link
            href="/feed"
            className="text-[10px] tracking-widest2 text-dim hover:text-fg ml-2"
          >
            CLEAR ALL ✕
          </Link>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 md:gap-8">
        {/* Mobile-only collapsible filter rail */}
        <details className="md:hidden border border-line">
          <summary className="cursor-pointer list-none p-3 text-[11px] tracking-widest2 flex items-center justify-between hover:bg-panel">
            <span>FILTERS{hasActiveFilters ? ` (${[
              searchParams.sev && 'SEV',
              searchParams.cat && 'CAT',
              searchParams.actor && 'ACTOR',
              searchParams.cve && 'CVE',
              searchParams.source && 'SRC',
              searchParams.tlp && 'TLP',
              searchParams.ai && 'AI'
            ].filter(Boolean).length})` : ''}</span>
            <span className="text-dim text-[10px]">▼</span>
          </summary>
          <div className="p-3 border-t border-line">
            <FacetRail facets={facets} baseUrl="/feed" />
          </div>
        </details>

        {/* Desktop sidebar */}
        <aside className="hidden md:block w-[280px] flex-shrink-0">
          <FacetRail facets={facets} baseUrl="/feed" />
        </aside>

        <div className="flex-1 min-w-0">
          {docs.length === 0 ? (
            <EmptyState
              title="No reports match"
              description="Adjust filters or clear them to see more results."
              action={{ label: 'CLEAR FILTERS', href: '/feed' }}
            />
          ) : (
            <>
              <div className="border-t border-line">
                {docs.map((doc: any) => (
                  <DocCard key={doc.id} doc={doc} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-6 md:mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-line pt-4 md:pt-6">
                  <div className="text-[10px] tracking-widest2 text-dim">
                    Page {page} of {totalPages} ·{' '}
                    {(offset + 1).toLocaleString()}-
                    {(offset + docs.length).toLocaleString()} of{' '}
                    {total.toLocaleString()}
                  </div>
                  <div className="flex gap-2">
                    {page > 1 && (
                      <Link
                        href={buildPageUrl(page - 1)}
                        className="px-3 py-1 text-[10px] tracking-widest2 border border-line hover:bg-fg hover:text-bg transition-colors"
                      >
                        ← PREV
                      </Link>
                    )}
                    {page < totalPages && (
                      <Link
                        href={buildPageUrl(page + 1)}
                        className="px-3 py-1 text-[10px] tracking-widest2 border border-line hover:bg-fg hover:text-bg transition-colors"
                      >
                        NEXT →
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper: build URL search params with optional override (null = remove)
function buildFilterUrl(
  current: SearchParams,
  override: Record<string, string | null>
): string {
  const sp = new URLSearchParams();
  Object.entries(current).forEach(([k, v]) => {
    if (k === 'page') return;
    if (k in override) return; // handled below
    if (v) sp.set(k, String(v));
  });
  Object.entries(override).forEach(([k, v]) => {
    if (v !== null && v !== undefined) sp.set(k, v);
  });
  return sp.toString();
}

function DocCard({ doc }: { doc: any }) {
  // 4-line excerpt from content (first non-empty paragraph up to ~600 chars)
  const excerpt = (() => {
    if (doc.content && typeof doc.content === 'string') {
      const firstPara = doc.content
        .split(/\n\s*\n/)
        .map((s: string) => s.trim())
        .find((s: string) => s.length > 0);
      if (firstPara) return firstPara.slice(0, 600);
    }
    return doc.summary || '';
  })();

  return (
    <Link
      href={`/document/${doc.id}`}
      className="block p-3 md:p-5 border-b border-line hover:bg-bg-2 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 md:gap-4 mb-2">
        <h3 className="text-[14px] md:text-[16px] font-light leading-tight flex-1 min-w-0 break-words">
          {doc.title}
        </h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          {doc.tlp && <TLPBadge tlp={doc.tlp} size="sm" />}
          {doc.severity != null && (
            <SeverityGauge value={doc.severity} size="sm" />
          )}
        </div>
      </div>

      <div className="text-[11px] text-dim font-mono mb-3">
        {doc.source_name || '—'} · T{doc.source_tier ?? '?'}{doc.published_at ? ' · ' + new Date(doc.published_at).toISOString().split('T')[0] : ''}{doc.word_count > 0 ? ` · ${doc.word_count} words` : ''}{doc.ai_threat ? ' · AI THREAT' : ''}
      </div>

      {excerpt && (
        <p className="text-[12px] md:text-[13px] leading-relaxed text-fg line-clamp-3 mb-3 break-words">
          {excerpt}…
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {(doc.actors || []).slice(0, 3).map((a: string) => (
          <span
            key={a}
            className="text-[10px] tracking-widest2 px-1.5 py-[1px] font-mono uppercase border border-line text-[#ff3030]"
          >
            {a}
          </span>
        ))}
        {(doc.cves || []).slice(0, 2).map((c: string) => (
          <span
            key={c}
            className="text-[10px] tracking-widest2 px-1.5 py-[1px] font-mono uppercase border border-line text-[#ffd60a]"
          >
            {c}
          </span>
        ))}
        {(doc.techniques || []).slice(0, 2).map((t: string) => (
          <span
            key={t}
            className="text-[10px] tracking-widest2 px-1.5 py-[1px] font-mono uppercase border border-line text-[#ff9500]"
          >
            {t}
          </span>
        ))}
        <span className="text-[10px] tracking-widest2 text-dim ml-auto">
          → FULL REPORT
        </span>
      </div>
    </Link>
  );
}
