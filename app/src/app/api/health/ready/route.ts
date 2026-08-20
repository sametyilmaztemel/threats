import { NextResponse } from 'next/server';

// /api/health/ready — bağımlılıklar hazır mı?
// DB SELECT 1, son ingestion yaşı, active/healthy source sayısı.
// Ağır COUNT/unnest/facet YOK. Kısa process-local TTL (10s).
// Dönen: yalnız durum + check sonuçları. DB bağlantı bilgisi/hostname/secret/stack YOK.
//
// Status semantiği (docs/monitoring-runbook.md):
//   - DB down                  -> 503 'down'   (zorunlu bağımlılık)
//   - Ingestion warning/invalid/mismatch -> 200 'degraded'  (eski veriyle çalışıyor, restart yok)
//   - Ingestion critical       -> 200 'critical' (varsayılan) | 503 (INGEST_CRITICAL_AS_DOWN=1)
//   - Hepsi ok                 -> 200 'ok'
// Eşikler (dakika): INGESTION_WARNING_MINUTES=480, INGESTION_CRITICAL_MINUTES=840
//   Pozitif int; warning < critical; geçersiz -> startup FAIL.
//
// Saf mantık: scripts/lib/health.mjs (test edilebilir, IO yok).

export const dynamic = 'force-dynamic';

const TTL_MS = 10_000;

let cache: { at: number; payload: { status: string; checks: Record<string, string>; http: number } } | null = null;

async function readyPayload() {
  const { readEshikler, computeReadiness } = await import('../../../../lib/health.mjs');
  const e = readEshikler();

  // 1) DB canlı mı? — SELECT 1 (ağır sorgu yok)
  let dbOk = false;
  try {
    const { query } = await import('@/lib/db');
    await query('SELECT 1');
    dbOk = true;
  } catch {
    dbOk = false;
  }

  if (!dbOk) {
    return computeReadiness({ dbOk: false, lastIngestionMs: null, sources: null, eshikler: e });
  }

  // 2) sources + ingestion zamanı
  let sources: { active: number; healthy: number } | null = null;
  let lastIngestionMs: number | null = null;
  try {
    const { query } = await import('@/lib/db');
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
    if (last) {
      const d = new Date(last);
      lastIngestionMs = Number.isNaN(d.getTime()) ? null : d.getTime();
    }
    sources = { active: Number(r.active || 0), healthy: Number(r.healthy || 0) };
  } catch {
    sources = null;
  }

  return computeReadiness({ dbOk: true, lastIngestionMs, sources, eshikler: e });
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return respond(cache.payload);
  }
  let payload;
  try {
    payload = await readyPayload();
  } catch (e) {
    // config invalid (eşik doğrulaması) — runtime fallback degraded
    // eslint-disable-next-line no-console
    console.error('[health/ready] config invalid:', (e as Error).message);
    payload = { status: 'degraded', checks: { database: 'unknown' }, http: 200 };
  }
  cache = { at: now, payload };
  return respond(payload);
}

function respond(payload: { status: string; checks: Record<string, string>; http: number }) {
  return NextResponse.json(
    { status: payload.status, timestamp: new Date().toISOString(), checks: payload.checks },
    {
      status: payload.http,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
        'X-Health-Status': payload.status,
      },
    }
  );
}
