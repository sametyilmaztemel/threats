// lib/health.mjs — /api/health/ready saf karar mantığı (test edilebilir).
// route.ts: query() çağrısından sonra computeReadiness(dbOk, lastIngestionMs, sources) çağırır.
// Saat/dakika birimleri dakika. Pozitif int eşikler; warning < critical.

export const DEFAULT_INGESTION_WARNING_MIN = 480;  // 8 saat
export const DEFAULT_INGESTION_CRITICAL_MIN = 840; // 14 saat

export function parsePositiveIntMin(name, value, fallback) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`[health] ${name} geçersiz: ${value} (pozitif int dakika bekleniyor)`);
  }
  return n;
}

export function readEshikler(env = process.env) {
  const w = parsePositiveIntMin('INGESTION_WARNING_MINUTES', env.INGESTION_WARNING_MINUTES, DEFAULT_INGESTION_WARNING_MIN);
  const c = parsePositiveIntMin('INGESTION_CRITICAL_MINUTES', env.INGESTION_CRITICAL_MINUTES, DEFAULT_INGESTION_CRITICAL_MIN);
  if (!(w < c)) {
    throw new Error(`[health] warning (${w}) < critical (${c}) şartı ihlal edildi`);
  }
  return { warningMin: w, criticalMin: c, criticalAsDown: env.INGEST_CRITICAL_AS_DOWN === '1' };
}

// dbOk=true, lastIngestionMs=Date.now() ms, sources={active,healthy}|null, eshikler: parse edilmiş.
//   invalid timestamp (NaN) -> invalid/degraded
//   lastIngestionMs null      -> invalid/degraded (DB veri yok, güvenli degraded)
//   ageMin < warning          -> ok
//   warning <= ageMin < critical -> warning/degraded
//   ageMin >= critical        -> critical
// sources.healthy < sources.active -> degraded (restart döngüsü önleme)
export function computeReadiness({ dbOk, lastIngestionMs, sources, now = Date.now(), eshikler }) {
  const e = eshikler;
  const checks = { database: dbOk ? 'ok' : 'down' };
  if (sources != null) {
    checks.sources = `${sources.active}/${sources.healthy}`;
  } else {
    checks.sources = 'unknown';
  }
  if (!dbOk) {
    return { status: 'down', checks, http: 503, ingestionState: 'down' };
  }
  let ingState = 'ok';
  if (lastIngestionMs == null || !Number.isFinite(lastIngestionMs)) {
    ingState = 'invalid';
  } else {
    const ageMin = (now - lastIngestionMs) / 60_000;
    if (ageMin >= e.criticalMin) ingState = 'critical';
    else if (ageMin >= e.warningMin) ingState = 'warning';
  }
  checks.ingestion = ingState;
  const mismatch = sources != null && sources.healthy < sources.active;
  let status = 'ok';
  if (ingState === 'critical') status = 'critical';
  else if (ingState === 'warning' || ingState === 'invalid' || mismatch) status = 'degraded';
  const http = (status === 'down') ? 503
    : (status === 'critical' && e.criticalAsDown) ? 503
    : 200;
  return { status, checks, http, ingestionState: ingState };
}
