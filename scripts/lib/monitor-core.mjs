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


// ---- HTTP retry (read-only GET; ortak toplam bütçe + per-attempt timeout) ----
// Retry YALNIZ: network exception, AbortError (timeout), 408, 425, 429, 5xx.
// 4xx (200, 302, 304, 4xx-other) → retry YAPMA; caller assertion yapar
// (CSP/data/SEO validation upstream — maskeleme yok).
// Ortak toplam bütçe (default 30s): tüm attempt'lar + backoff toplamı aşılırsa
// yeni fetch yapilmaz (assert). Per-attempt timeout (default 10s): her fetch için.
// Retry-After (429/503): delta = min(header, kalan bütçe, 5000ms). HTTP-date destegi.
// Caller AbortSignal: iptal → tüm zincir durur + throw (AbortError).
// Final hata: { attempts, status?, totalMs, error? }; URL query/secret loglanmaz (path only).
const RETRY_STATUS = new Set([408, 425, 429, 503]);
const MAX_HTTP_ATTEMPTS = 3;
const DEFAULT_TOTAL_BUDGET_MS = 30000;
const DEFAULT_PER_ATTEMPT_TIMEOUT_MS = 10000;
const MAX_RETRY_AFTER_MS = 5000;
const BASE_BACKOFF_MS = 200; // 200ms, 400ms, 800ms (toplam bütçeye dahil)

// URL'den query string ve userinfo'yu kaldir (secret/credential loglanmasin)
function _safeUrlForLog(u) {
  try {
    const url = new URL(u);
    return url.origin + url.pathname;
  } catch { return '<invalid-url>'; }
}

// Retry-After parse: delta-seconds (number) veya HTTP-date (string).
// nowMs: DI (test deterministic); default Date.now().
// Returns ms (>=0) veya null (parse edilemedi / gecmis tarih).
export function parseRetryAfter(v, nowMs) {
  if (v == null) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n * 1000);
  // HTTP-date: "Wed, 21 Oct 2015 07:28:00 GMT"
 const _now = typeof nowMs === 'number' ? nowMs : Date.now();
 const t = Date.parse(v);
  if (Number.isFinite(t)) return Math.max(0, t - _now);
  return null;
}

export async function httpRetry(url, opts = {}) {
  const max = Math.max(1, Math.min(MAX_HTTP_ATTEMPTS, Number(opts.maxAttempts) || MAX_HTTP_ATTEMPTS));
  const totalBudget = Math.max(1000, Number(opts.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS));
  const perAttemptTimeout = Math.max(100, Number(opts.perAttemptTimeoutMs ?? DEFAULT_PER_ATTEMPT_TIMEOUT_MS));
  const baseBackoff = Math.max(0, Number(opts.baseBackoffMs ?? BASE_BACKOFF_MS));
  const fetchImpl = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  const onAttempt = typeof opts.onAttempt === 'function' ? opts.onAttempt : () => {};
  // Caller AbortSignal (iptal tum zinciri durdurur)
  const callerSignal = opts.signal || (opts.fetchOpts && opts.fetchOpts.signal) || null;

  if (!fetchImpl) throw new Error('httpRetry: no fetch implementation available');

  const startMs = Date.now();
  let attempts = 0;
  let lastErr = null;
  let lastStatus = null;
  let lastRes = null;
  const safeUrl = _safeUrlForLog(url);

  for (let attempt = 1; attempt <= max; attempt++) {
    // Caller iptal kontrolu
    if (callerSignal && callerSignal.aborted) {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    }
    const elapsed = Date.now() - startMs;
    const remaining = totalBudget - elapsed;
    if (remaining <= 0) {
      // Butce tukendi — yeni fetch yapma
      const e = new Error(`httpRetry: total budget ${totalBudget}ms exhausted after ${attempts} attempt(s) (elapsed ${elapsed}ms)`);
      e.attempts = attempts; e.status = lastStatus; e.totalMs = elapsed;
      throw e;
    }
    // Per-attempt timeout = min(perAttemptTimeout, remaining)
    const thisAttemptTimeout = Math.min(perAttemptTimeout, remaining);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), thisAttemptTimeout);
    // Caller signal + bu attempt abort birlestir
    const onCallerAbort = () => ac.abort();
    if (callerSignal) {
      if (callerSignal.aborted) { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
    attempts++;
    let res = null; let error = null;
    try {
      res = await fetchImpl(url, { ...(opts.fetchOpts || {}), signal: ac.signal });
    } catch (e) {
      error = e;
    } finally {
      clearTimeout(t);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
    }
    lastRes = res; lastStatus = res ? res.status : null;

    onAttempt({ attempt, max, url: safeUrl, status: lastStatus, error: error && error.message, elapsedMs: Date.now() - startMs });

    // 2xx-3xx → basarili
    if (!error && res && res.status >= 200 && res.status < 400) return res;

    lastErr = error || (res ? new Error('http ' + res.status) : new Error('no response'));
    const retryable = error || (res && (RETRY_STATUS.has(res.status) || res.status >= 500));

    if (!retryable || attempt >= max) {
      // Son deneme veya retryable degil:
      //  - 4xx (retryable degil) → res dondur (caller validation)
      //  - 5xx/network          → throw (with diagnostic)
      if (res && res.status >= 400 && res.status < 500 && !error) return res;
      const err = new Error(`httpRetry failed: ${lastErr.message} (attempts=${attempts}, status=${lastStatus || 'n/a'}, totalMs=${Date.now() - startMs}ms, url=${safeUrl})`);
      err.attempts = attempts; err.status = lastStatus; err.totalMs = Date.now() - startMs;
      throw err;
    }

    // Retry-After varsa delta olarak kullan (cap olarak); yoksa exp backoff + jitter
    let delay;
    const ra = res && (res.headers && (res.headers.get ? res.headers.get('retry-after') : res.headers['retry-after']));
    const raMs = parseRetryAfter(ra, opts.nowMs);
    if (raMs != null) {
      // Retry-After: min(header, MAX_RETRY_AFTER_MS, remaining)
      delay = Math.min(raMs, MAX_RETRY_AFTER_MS);
    } else {
      // Exp backoff: base * 2^(n-1) + jitter (0..base/2)
      delay = baseBackoff * Math.pow(2, attempt - 1) + Math.floor(Math.random() * baseBackoff / 2);
    }
    delay = Math.max(0, delay);
    // Kalan butce ile sinirla; once kontrol (3. attempt'a gecmeden durdur)
    const remainingAfter = totalBudget - (Date.now() - startMs) - delay;
    if (remainingAfter <= 0) {
      // Bütçe bu backoff sonrası tükenecek → yeni fetch yapma, throw
      const e = new Error(`httpRetry: budget ${totalBudget}ms exhausted before next attempt (attempts=${attempts}, url=${safeUrl})`);
      e.attempts = attempts; e.status = lastStatus; e.totalMs = Date.now() - startMs;
      throw e;
    }
    // 3. attempt oncesi tekrar kalan-butce kontrolu (cap sonrasi)
    const thisTimeoutNext = Math.min(perAttemptTimeout, remainingAfter);
    if (thisTimeoutNext <= 0) {
      // Yeni fetch yapma
      const e = new Error(`httpRetry: budget ${totalBudget}ms exhausted before next attempt (attempts=${attempts}, url=${safeUrl})`);
      e.attempts = attempts; e.status = lastStatus; e.totalMs = Date.now() - startMs;
      throw e;
    }
    // Max 5s cap (kullanici talebi: "asiri Retry-After 5s'de cap edilir")
    delay = Math.min(delay, remainingAfter);
    const sleep = typeof opts.sleep === 'function' ? opts.sleep : (ms) => new Promise((r) => setTimeout(r, ms));
    await sleep(delay);
  }
  // (dongu her zaman ya return ya throw yapar)
  throw lastErr || new Error('http-retry exhausted');
}

// ---- webhook emit (HTTP POST; timeout + non-2xx retry) ----
// Webhook: POST + JSON body. 5xx, 408, 425, 429 retry (max 2 deneme, 500ms backoff).
// 4xx (clien error, webhook URL yanlis) retry yok — log ve devam et.
// Timeout 10s.
const WEBHOOK_MAX = 2;
export async function emitWebhook(url, payload, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs ?? 10_000);
  const fetchImpl = opts.fetchImpl || fetch;
  const onAttempt = typeof opts.onAttempt === 'function' ? opts.onAttempt : () => {};
  let lastErr = null;
  for (let attempt = 1; attempt <= WEBHOOK_MAX; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res, error;
    try {
      res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
    } catch (e) {
      error = e;
    } finally { clearTimeout(t); }
    onAttempt({ attempt, url, status: res && res.status, error: error && error.message });
    if (!error && res && res.status >= 200 && res.status < 300) return { ok: true, status: res.status, attempts: attempt };
    lastErr = error || new Error('webhook non-2xx: ' + (res && res.status));
    const status = res && res.status;
    const retryable = error || (status && (RETRY_STATUS.has(status) || status >= 500));
    if (!retryable || attempt >= WEBHOOK_MAX) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, error: lastErr && lastErr.message };
}
