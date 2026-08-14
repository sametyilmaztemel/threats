import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://threats:***@localhost:5432/threats',
  max: 10,
  idleTimeoutMillis: 30000
});

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
  const r = await pool.query(text, params);
  return { rows: r.rows as T[], rowCount: r.rowCount || 0 };
}

export async function getStats() {
  const { rows } = await query<any>(`SELECT * FROM stats_summary`);
  return rows[0] || {};
}

export async function getRecentDocuments(limit = 50, aiOnly = false) {
  const where = aiOnly ? 'WHERE ai_threat = TRUE' : '';
  const { rows } = await query<any>(
    `SELECT d.id, d.title, d.url, d.severity, d.published_at, d.fetched_at,
            d.category, d.cves, d.actors, d.ai_threat, s.name as source_name, s.category as source_category
     FROM documents d
     LEFT JOIN sources s ON d.source_id = s.id
     ${where}
     ORDER BY COALESCE(d.published_at, d.fetched_at) DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function searchDocuments(search: string, limit = 50, aiOnly = false) {
  const where = aiOnly ? 'AND ai_threat = TRUE' : '';
  const { rows } = await query<any>(
    `SELECT d.id, d.title, d.url, d.severity, d.published_at, d.fetched_at,
            d.category, d.cves, d.actors, d.ai_threat, s.name as source_name, s.category as source_category
     FROM documents d
     LEFT JOIN sources s ON d.source_id = s.id
     WHERE (
       d.title ILIKE '%' || $2 || '%'
       OR d.summary ILIKE '%' || $2 || '%'
       OR d.content ILIKE '%' || $2 || '%'
       OR d.author ILIKE '%' || $2 || '%'
       OR EXISTS (SELECT 1 FROM unnest(COALESCE(d.actors, ARRAY[]::text[])) a WHERE a ILIKE '%' || $2 || '%')
       OR EXISTS (SELECT 1 FROM unnest(COALESCE(d.cves, ARRAY[]::text[])) c WHERE c ILIKE '%' || $2 || '%')
       OR EXISTS (SELECT 1 FROM unnest(COALESCE(d.tags, ARRAY[]::text[])) t WHERE t ILIKE '%' || $2 || '%')
     ) ${where}
     ORDER BY COALESCE(d.published_at, d.fetched_at) DESC
     LIMIT $1`,
    [limit, search]
  );
  return rows;
}

export async function getIOCs(limit = 100, type?: string) {
  let rows;
  if (type) {
    rows = (await query<any>(
      `SELECT i.*, s.name as source_name FROM iocs i
       LEFT JOIN sources s ON i.source_id = s.id
       WHERE i.type = $1
       ORDER BY i.created_at DESC LIMIT $2`,
      [type, limit]
    )).rows;
  } else {
    rows = (await query<any>(
      `SELECT i.*, s.name as source_name FROM iocs i
       LEFT JOIN sources s ON i.source_id = s.id
       ORDER BY i.created_at DESC LIMIT $1`,
      [limit]
    )).rows;
  }
  return rows;
}

export async function getActors(limit = 100) {
  const { rows } = await query<any>(
    `SELECT * FROM actors ORDER BY document_count DESC, name ASC LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function getSources() {
  const { rows } = await query<any>(
    `SELECT id, name, type, category, tier, language, last_fetched_at, last_status, last_items_count, total_items, enabled
     FROM sources ORDER BY tier, name`
  );
  return rows;
}

export async function getDailySeverity() {
  const { rows } = await query<any>(
    `SELECT day, critical, high, medium, low, total
     FROM daily_severity
     ORDER BY day DESC LIMIT 90`
  );
  return rows.reverse();
}

export async function getAITreatments(limit = 50) {
  const { rows } = await query<any>(
    `SELECT a.*, d.title, d.url, d.published_at, d.severity
     FROM ai_threats a
     JOIN documents d ON a.document_id = d.id
     ORDER BY COALESCE(d.published_at, d.fetched_at) DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function getDocument(id: number | string) {
  const r = await query<any>(
    `SELECT d.*, s.name as source_name, s.category as source_category, s.tier as source_tier
     FROM documents d
     LEFT JOIN sources s ON d.source_id = s.id
     WHERE d.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

export async function getIOC(id: number | string) {
  const r = await query<any>(
    `SELECT i.*, s.name as source_name
     FROM iocs i
     LEFT JOIN sources s ON i.source_id = s.id
     WHERE i.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

export async function getRelatedDocuments(docId: number, limit = 10) {
  const r = await query<any>(
    `SELECT d2.id, d2.title, d2.url, d2.severity, d2.ai_threat, d2.published_at,
            s.name as source_name
     FROM documents d1
     JOIN documents d2 ON d2.id != d1.id
     LEFT JOIN sources s ON d2.source_id = s.id
     WHERE d1.id = $1 AND (
       d2.cves && d1.cves
       OR d2.actors && d1.actors
       OR d2.techniques && d1.techniques
     )
     GROUP BY d2.id, s.name
     ORDER BY d2.published_at DESC NULLS LAST, d2.fetched_at DESC NULLS LAST
     LIMIT $2`,
    [docId, limit]
  );
  return r.rows;
}

export async function getCVEs(limit = 100) {
  const { rows } = await query<any>(
    `SELECT d.id, d.title, d.url, d.severity, d.published_at, d.fetched_at,
            d.category, d.cves, d.actors, d.ai_threat,
            s.name as source_name, s.category as source_category
     FROM documents d
     LEFT JOIN sources s ON d.source_id = s.id
     WHERE d.cves IS NOT NULL AND array_length(d.cves, 1) > 0
     ORDER BY COALESCE(d.published_at, d.fetched_at) DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function getCVEList(page = 1, pageSize = 50, search?: string) {
  const offset = (page - 1) * pageSize;
  const hasSearch = search && search.trim();
  const where = hasSearch
    ? `WHERE (ce.cve_id ILIKE $3 OR ce.description ILIKE $3 OR ce.vendor ILIKE $3 OR ce.product ILIKE $3)`
    : '';
  const params = hasSearch
    ? [pageSize, offset, `%${search.trim()}%`]
    : [pageSize, offset];
  const { rows } = await query<any>(
    `SELECT ce.cve_id, ce.cvss_v3, ce.description, ce.vendor, ce.product, ce.published_date, ce.last_enriched_at,
            (SELECT COUNT(*) FROM document_cves dc WHERE dc.cve_id = ce.cve_id) as mentions,
            (SELECT COUNT(*) FROM document_cves dc WHERE dc.cve_id = ce.cve_id AND EXISTS (
              SELECT 1 FROM documents d2 WHERE d2.id = dc.document_id AND d2.ai_threat
            )) as ai_mentions
     FROM cve_enrichment ce
     ${where}
     ORDER BY ce.cvss_v3 DESC NULLS LAST, ce.cve_id
     LIMIT $1 OFFSET $2`,
    params
  );
  return rows;
}

export async function getCVECount(search?: string) {
  const hasSearch = search && search.trim();
  const where = hasSearch
    ? `WHERE (cve_id ILIKE $1 OR description ILIKE $1 OR vendor ILIKE $1 OR product ILIKE $1)`
    : '';
  const params = hasSearch ? [`%${search.trim()}%`] : [];
  const { rows } = await query<any>(
    `SELECT COUNT(*)::int as total FROM cve_enrichment ce ${where}`,
    params
  );
  return rows[0]?.total || 0;
}

export async function getGraphData() {
  const actors = await query<any>(
    `SELECT id, name FROM actors ORDER BY name`
  );
  const techniques = await query<any>(
    `SELECT id, name FROM techniques ORDER BY name`
  );
  const sectors = await query<any>(
    `SELECT DISTINCT unnest(sectors) as name FROM documents WHERE sectors IS NOT NULL`
  );
  const edges = await query<any>(
    `SELECT DISTINCT a.name as source, t.name as target
     FROM documents d,
          unnest(d.actors) as a(name),
          unnest(d.techniques) as t(name)
     WHERE d.actors IS NOT NULL AND d.techniques IS NOT NULL`
  );
  const nodes = [
    ...actors.rows.map((a: any) => ({ id: `a:${a.name}`, label: a.name, group: 'actor' })),
    ...techniques.rows.map((t: any) => ({ id: `t:${t.name}`, label: t.name, group: 'technique' })),
    ...sectors.rows.map((s: any) => ({ id: `s:${s.name}`, label: s.name, group: 'sector' })),
  ];
  const edgeList = edges.rows.map((e: any) => ({ from: `a:${e.source}`, to: `t:${e.target}` }));
  return { nodes, edges: edgeList };
}

export async function getTrends(days = 30) {
  const { rows } = await query<any>(
    `SELECT date_trunc('day', COALESCE(published_at, fetched_at))::date as day,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE ai_threat) as ai_count,
            COUNT(*) FILTER (WHERE severity = 'critical') as critical,
            COUNT(*) FILTER (WHERE severity = 'high') as high
     FROM documents
     WHERE COALESCE(published_at, fetched_at) >= NOW() - ($1 || ' days')::interval
     GROUP BY day
     ORDER BY day`,
    [days]
  );
  return rows;
}

// ─── Rapor query'leri (uzun vadeli kaynak ürün) ────────────────

export async function getReportSectorSummary(limit = 12) {
  const { rows } = await query<any>(
    `SELECT sector, COUNT(*) as doc_count,
            COUNT(*) FILTER (WHERE severity >= 8) as critical,
            COUNT(*) FILTER (WHERE severity >= 5 AND severity < 8) as high,
            COUNT(*) FILTER (WHERE ai_threat) as ai_count
     FROM documents d, unnest(d.sectors) as sector
     WHERE d.sectors IS NOT NULL AND array_length(d.sectors, 1) > 0
     GROUP BY sector ORDER BY doc_count DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function getReportActorTimeline(days = 90) {
  const { rows } = await query<any>(
    `SELECT a.name as actor,
            date_trunc('day', COALESCE(d.published_at, d.fetched_at))::date as day,
            COUNT(*) as doc_count
     FROM documents d, unnest(d.actors) as a(name)
     WHERE d.actors IS NOT NULL AND array_length(d.actors, 1) > 0
       AND COALESCE(d.published_at, d.fetched_at) >= NOW() - ($1 || ' days')::interval
     GROUP BY a.name, day ORDER BY a.name, day`,
    [days]
  );
  return rows;
}

export async function getReportKillChain() {
  const { rows } = await query<any>(
    `SELECT COALESCE(kill_chain_phase, 'unclassified') as phase, COUNT(*) as doc_count
     FROM documents GROUP BY phase ORDER BY doc_count DESC`
  );
  return rows;
}

export async function getReportSourceHealth() {
  const { rows } = await query<any>(
    `SELECT s.name, s.category, s.tier, s.enabled,
            s.total_items, s.last_items_count, s.last_status,
            COUNT(d.id) as docs_ingested,
            MAX(d.fetched_at) as last_fetch
     FROM sources s
     LEFT JOIN documents d ON d.source_id = s.id
     GROUP BY s.name, s.category, s.tier, s.enabled, s.total_items, s.last_items_count, s.last_status
     ORDER BY s.tier, s.name`
  );
  return rows;
}

export async function getReportTopIOCs(type?: string, limit = 25) {
  const { rows } = await query<any>(
    `SELECT value, type, COUNT(*) as doc_mentions,
            MAX(confidence) as max_conf, MIN(first_seen) as first_seen, MAX(last_seen) as last_seen
     FROM iocs
     WHERE ($1::text IS NULL OR type = $1)
     GROUP BY value, type
     ORDER BY doc_mentions DESC, value
     LIMIT $2`,
    [type || null, limit]
  );
  return rows;
}

export async function getActorTimeline(name: string, days = 90) {
  const { rows } = await query<any>(
    `SELECT date_trunc('day', COALESCE(d.published_at, d.fetched_at))::date as day,
            COUNT(*)::int as doc_count,
            COUNT(*) FILTER (WHERE d.severity >= 8)::int as critical
     FROM documents d
     WHERE ($1 = ANY(d.actors)
            OR EXISTS (
              SELECT 1 FROM document_actors da
              JOIN actors a ON a.id = da.actor_id
              WHERE da.document_id = d.id AND LOWER(a.name) = LOWER($1)
            ))
       AND COALESCE(d.published_at, d.fetched_at) >= NOW() - ($2 || ' days')::interval
     GROUP BY day ORDER BY day`,
    [name, days]
  );
  return rows;
}

export async function getReportWeeklyDigest(days = 7) {
  const { rows } = await query<any>(
    `SELECT day, COUNT(*) as total, COUNT(*) FILTER (WHERE ai_threat) as ai_count,
            COUNT(*) FILTER (WHERE cves IS NOT NULL) as has_cves,
            ARRAY_AGG(DISTINCT source_name) FILTER (WHERE source_name IS NOT NULL) as sources
     FROM (
       SELECT date_trunc('day', COALESCE(d.published_at, d.fetched_at))::date as day,
              d.ai_threat, d.cves, s.name as source_name
       FROM documents d
       LEFT JOIN sources s ON d.source_id = s.id
       WHERE COALESCE(d.published_at, d.fetched_at) >= NOW() - ($1 || ' days')::interval
     ) sub
     GROUP BY day ORDER BY day DESC`,
    [days]
  );
  return rows;
}
