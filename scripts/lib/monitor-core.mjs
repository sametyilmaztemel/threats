import { cspNonce } from './parsers.mjs';
// lib/monitor-core.mjs — SAF alarm state machine (test edilebilir, IO yok).
// production-monitor.mjs ve test/ birlikte kullanır. HTTP/state-dosya/webhook YOK.
// Sorumluluk: fingerprint, ardışık sayma, eşik, cooldown, recovery, baseline.

import { createHash } from 'node:crypto';

// fingerprint: check ID + env + target
export function fingerprint(checkId, env, target) {
  return createHash('sha256').update(`${checkId}|${env}|${target}`).digest('hex').slice(0, 24);
}

// Yeni check kaydı // // durumu temiz varsay
export function newCheckState() {
  return { status: 'ok', consecutiveFailures: 0, lastOkAt: null, firstSeenAt: null };
}

// Baseline: ilk gözlemse (daha önce hiç başarılı zaman yok) alarm ÜRETME; sadece kaydet.
// Dönüş: { action: 'baseline'|'ok'|'pending'|'alert'|'recovery'|'cooldown', state }
export function decideAlarm(stateMap, fingerprintKey, severity, okNow, now, opts = {}) {
  const warningThreshold = opts.warningThreshold ?? 2;
  const criticalThreshold = opts.criticalThreshold ?? 2;
  const cooldownMs = opts.cooldownMs ?? 30 * 60 * 1000;

  let c = stateMap[fingerprintKey] || newCheckState();
  if (c.firstSeenAt == null) c.firstSeenAt = now;
  c.seenAt = now;

  // ilk gözlem (baseline) — ok olsun olmasın, alarm yok
  const isFirst = c.lastOkAt == null && c.consecutiveFailures === 0 && c.status === 'ok';

  if (okNow) {
    const wasFailing = c.status !== 'ok' && c.consecutiveFailures > 0;
    c.status = 'ok';
    const cfs = c.consecutiveFailures;
    c.consecutiveFailures = 0;
    c.lastOkAt = now;
    stateMap[fingerprintKey] = c;
    if (isFirst) return { action: 'baseline', state: c };
    if (wasFailing) return { action: 'recovery', state: c, previousFailures: cfs };
    return { action: 'ok', state: c };
  }

  // başarısız
  c.consecutiveFailures = (c.consecutiveFailures || 0) + 1;
  const threshold = severity === 'critical' ? criticalThreshold : warningThreshold;
  const inCooldown = c.lastAlertAt != null && (now - c.lastAlertAt) < cooldownMs;

  stateMap[fingerprintKey] = c;
  if (isFirst) return { action: 'baseline', state: c };
  if (c.consecutiveFailures >= threshold) {
    if (inCooldown) return { action: 'cooldown', state: c };
    c.status = severity;
    c.lastAlertAt = now;
    stateMap[fingerprintKey] = c;
    return { action: 'alert', state: c };
  }
  return { action: 'pending', state: c };
}

// state dosyası onarımı (bozuk -> güvenli yeniden oluştur)
export function sanitizeState(raw) {
  if (!raw || typeof raw !== 'object') return { checks: {} };
  const checks = raw.checks && typeof raw.checks === 'object' ? raw.checks : {};
  for (const k of Object.keys(checks)) {
    const c = checks[k];
    if (!c || typeof c !== 'object') delete checks[k];
    else {
      c.consecutiveFailures = Number(c.consecutiveFailures || 0);
      if (typeof c.status !== 'string') delete checks[k];
    }
  }
  return { checks };
}


// ---- ingestion state mapping (ready endpoint JSON -> severity) ----
// readyJson = { status, checks: { database, sources, ingestion } }
// ingestion string: 'ok' | 'warning' | 'critical' | 'invalid' | 'down'
export function ingestionSeverityFromReady(readyJson) {
  if (!readyJson || !readyJson.checks) return { severity: null, ingestionState: 'unknown' };
  const db = readyJson.checks.database;
  if (db === 'down') return { severity: 'critical', ingestionState: 'down' };
  const ing = readyJson.checks.ingestion;
  if (ing === 'critical') return { severity: 'critical', ingestionState: 'critical' };
  if (ing === 'warning' || ing === 'invalid') return { severity: 'warning', ingestionState: ing };
  // ok veya unknown -> baseline gürültüsü
  return { severity: null, ingestionState: ing || 'unknown' };
}

// ---- source mismatch ----
// readyJson.checks.sources: "18/18" veya "18/16 (degraded)"
export function sourcesFromReady(readyJson) {
  if (!readyJson || !readyJson.checks || !readyJson.checks.sources) return null;
  const m = String(readyJson.checks.sources).match(/^(\d+)\/(\d+)/);
  if (!m) return null;
  return { active: Number(m[1]), healthy: Number(m[2]) };
}

// ---- cache HIT/MISS from server-timing header ----
export function cacheHitFromServerTiming(st) {
  if (!st) return false;
  return /cache;desc="?HIT/.test(st) || /cfCacheStatus;desc="?HIT/.test(st);
}

// ---- CSP nonce + unsafe-inline/eval ----
export function cspOkFromHeaders(cspHeader) {
  if (!cspHeader) return { ok: false, reason: 'no-csp' };
  if (/unsafe-inline/.test(cspHeader)) return { ok: false, reason: 'unsafe-inline' };
  if (/unsafe-eval/.test(cspHeader)) return { ok: false, reason: 'unsafe-eval' };
  const n = cspNonce(cspHeader);
  if (!n) return { ok: false, reason: 'no-nonce' };
  return { ok: true, nonce: n };
}

// ---- origin guard: secretsiz istek 403/404 olmalı ----
export function originGuardOk(status) {
  return status === 403 || status === 404;
}

// ---- secret/cookie/Authorization loglanmaz (redact) ----
export function redactForLog(o) {
  const s = JSON.stringify(o);
  return s.replace(/(token|secret|key|cookie|authorization|nonce)["']?\s*[:=]\s*["']?[A-Za-z0-9_\-\.]{4,}/gi, '$1=***');
}

// ---- webhook payload format (provider-specific) ----
export function formatWebhookPayload(p, type) {
  if (type === 'slack') {
    return { text: `[${String(p.severity||'').toUpperCase()}] ${p.check}: ${p.message} (${p.target})`, username: 'threats-monitor' };
  }
  if (type === 'telegram') {
    return { chat_id: p.environment, text: `[${String(p.severity||'').toUpperCase()}] ${p.check}: ${p.message}` };
  }
  return p; // generic
}

// ---- atomic state write (tmp + rename) ----
import { mkdirSync as _mkdirSync, writeFileSync as _wf, renameSync as _rn, openSync as _op, existsSync as _ex, readFileSync as _rf, unlinkSync as _ul } from 'node:fs';
import { randomUUID as _uuid } from 'node:crypto';
export function atomicWriteState(path, state) {
  if (!path) return false; // dry-run guard
  _mkdirSync(path.replace(/[^/]+$/, ''), { recursive: true });
  const tmp = path + '.tmp.' + _uuid();
  _wf(tmp, JSON.stringify(state, null, 2), 'utf8');
  _rn(tmp, path);
  return true;
}
export function readState(path) {
  if (!_ex(path)) return null;
  try {
    return JSON.parse(_rf(path, 'utf8'));
  } catch {
    return null;
  }
}

// ---- parallel lock (O_EXCL) ----
export function acquireLock(lockPath) {
  try {
    _mkdirSync(lockPath.replace(/[^/]+$/, ''), { recursive: true });
    const fd = _op(lockPath, 'wx');
    return { ok: true, fd };
  } catch (e) {
    return { ok: false, reason: e.code || 'lock-failed' };
  }
}
export function releaseLock(lockPath, fd) {
  try { if (fd != null) fd.closeSync(); } catch {}
  try { _ul(lockPath); } catch {}
}
