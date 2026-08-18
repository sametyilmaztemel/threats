import { NextResponse } from 'next/server';

// /api/health/ready — bağımlılıklar hazır mı? DB SELECT 1, son ingestion yaşı,
// active/healthy source sayısı. Ağır COUNT/unnest/facet YOK.
// Kritik bağımlılık hatası -> 503. Kısa process-local TTL (10s) — her istekte pahalı sorgu YOK.
// Dönen: yalnız durum + check sonuçları. DB bağlantı bilgisi/hostname/secret/stack YOK.

export const dynamic = 'force-dynamic';

const TTL_MS = 10_000;
const INGEST_STALE_MIN = 24 * 60 * 60_000; // 24s ingestion yaşı üstü => stale (warning, hazır değil değil)

let cache: { at: number; payload: any } | null = null;

async function readyPayload() {
  const { query } = await import('@/lib/db');

  // 1) DB canlı mı?
  let db = 'down';
  try {
    await query('SELECT 1');
    db = 'ok';
  } catch (e) {
    db = 'down';
  }

  let sources = null;
  let lastIngestionMs = null;
  if (db === 'ok') {
    try {
      const sr = await query<any>(
        `SELECT
           count(*) FILTER (WHERE enabled) AS active,
           count(*) FILTER (WHERE enabled AND last_status = 'ok') AS healthy
         FROM sources`
      );
      const r = sr.rows[0] || {};
      const ing = await query<any>(
        `SELECT COALESCE(MAX(last_fetched_at), NOW() - interval '999 days') AS last_fetched FROM sources`
      );
      const last = ing.rows[0]?.last_fetched;
      lastIngestionMs = last ? new Date(last).getTime() : null;
      sources = { active: Number(r.active || 0), healthy: Number(r.healthy || 0) };
    } catch (e) {
      sources = null;
    }
  }

  const ingestionStale = lastIngestionMs != null && (Date.now() - lastIngestionMs) > INGEST_STALE_MIN;

  const status = db === 'down' ? 'down' : ingestionStale ? 'degraded' : 'ok';

  const checks: Record<string, string> = {
    database: db,
  };
  if (sources != null) {
    checks.sources = `${sources.active}/${sources.healthy}`;
    if (sources.healthy < sources.active) checks.sources += ` (degraded)`;
  }
  checks.ingestion = ingestionStale ? 'stale' : 'ok';

  return {
    status,
    timestamp: new Date().toISOString(),
    checks,
  };
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return respond(cache.payload);
  }
  const payload = await readyPayload();
  cache = { at: now, payload };
  return respond(payload);
}

function respond(payload: any) {
  const ok = payload.status !== 'down';
  return NextResponse.json(payload, {
    status: ok ? (payload.status === 'degraded' ? 503 : 200) : 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'X-Health-Status': payload.status,
    },
  });
}
