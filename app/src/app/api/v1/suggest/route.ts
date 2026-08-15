import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/v1/suggest?q=ransom&type=all|actor|cve|source|sector
// Autocomplete için hafif öneriler (title prefix + entity eşleşmesi)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim();
  const type = sp.get('type') || 'all';
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  const like = `%${q}%`;
  const suggestions: any[] = [];

  const types = type === 'all'
    ? ['document', 'actor', 'cve', 'source', 'sector']
    : [type];

  if (types.includes('document')) {
    const { rows } = await query<any>(
      `SELECT id, title FROM documents WHERE title ILIKE $1 ORDER BY quality_score DESC NULLS LAST, fetched_at DESC LIMIT 5`,
      [like]
    );
    for (const r of rows) suggestions.push({ type: 'document', id: r.id, label: r.title });
  }
  if (types.includes('actor')) {
    const { rows } = await query<any>(
      `SELECT name FROM actors WHERE name ILIKE $1 OR $1 = ANY(COALESCE(aliases, ARRAY[]::text[])) ORDER BY document_count DESC LIMIT 5`,
      [like]
    );
    for (const r of rows) suggestions.push({ type: 'actor', id: r.name, label: r.name });
  }
  if (types.includes('cve')) {
    const { rows } = await query<any>(
      `SELECT cve_id, description FROM cve_enrichment WHERE cve_id ILIKE $1 ORDER BY cvss_v3 DESC NULLS LAST LIMIT 5`,
      [like]
    );
    for (const r of rows) suggestions.push({ type: 'cve', id: r.cve_id, label: r.cve_id });
  }
  if (types.includes('source')) {
    const { rows } = await query<any>(
      `SELECT name FROM sources WHERE name ILIKE $1 AND enabled=true LIMIT 5`,
      [like]
    );
    for (const r of rows) suggestions.push({ type: 'source', id: r.name, label: r.name });
  }
  if (types.includes('sector')) {
    const { rows } = await query<any>(
      `SELECT DISTINCT sector as name FROM documents d, LATERAL unnest(d.sectors) sector
       WHERE d.sectors IS NOT NULL AND sector ILIKE $1 LIMIT 5`,
      [like]
    );
    for (const r of rows) suggestions.push({ type: 'sector', id: r.name, label: r.name });
  }

  return NextResponse.json({ suggestions: suggestions.slice(0, 8) });
}
