// production-monitor.mjs — threats.0rce.com dış production monitor (uptime/ingestion/veri kalitesi).
// Read-only: production'a yazma yok. State/cooldown/adaptive alarm + webhook bildirim.
//
// Aşama 1 parser/utillerini yeniden kullanır (lib/parsers.mjs) — kod kopyalama.
//
// Kullanım:
//   node scripts/production-monitor.mjs            # normal (state + webhook, alarm gönderebilir)
//   node scripts/production-monitor.mjs --dry-run  # production kontrolleri yapar, webhook GÖNDERMEZ,
//                                                  # state'i prod path'e YAZMAZ, payload'ı redact gösterir
//   npm run monitor:check
//   npm run monitor:dry-run
//
// Exit: 0 her zaman (monitor kendisi hata değilse); alarm kritikliği state'e geçer.
// - Hatalı durumlar exit 2 (webhook gönderilemedi), 3 (state bozuk) => watchdog bunu log alır.

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, openSync, unlinkSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import {
  cspNonce, scriptNonces, parseSourceHealth,
  parseServerTiming, seoMeta,
} from './lib/parsers.mjs';
import { fingerprint as coreFingerprint, decideAlarm as coreDecide, sanitizeState } from './lib/monitor-core.mjs';

// ---------------- config ----------------
const ENV = process.env.MONITOR_ENV || 'production';
const BASE = (process.env.MONITOR_BASE_URL || 'https://threats.0rce.com').replace(/\/$/, '');
const STATE_PATH = process.env.MONITOR_STATE_PATH ||
  (process.argv.includes('--dry-run') ? './.runtime/threats-monitor-state.json' : '/var/lib/threats-monitor/state.json');
const LOCK_PATH = STATE_PATH.replace(/state\.json$/, 'state.lock');
const WARNING_THRESHOLD = Number(process.env.MONITOR_WARNING_THRESHOLD || 2);
const CRITICAL_THRESHOLD = Number(process.env.MONITOR_CRITICAL_THRESHOLD || 2);
const COOLDOWN_SECONDS = Number(process.env.MONITOR_COOLDOWN_SECONDS || 1800);
// Ingestion staleness: dakika cinsinden (collector ~360dk'da/6s bir tur).
// 0..INGESTION_WARNING_MIN: ok, WARNING..CRITICAL: degraded, CRITICAL+: critical.
function parsePosIntMin(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`[monitor] ${name} geçersiz: ${raw} (pozitif int dakika bekleniyor)`);
  }
  return n;
}
const INGESTION_WARNING_MIN = parsePosIntMin('MONITOR_INGESTION_WARNING_MINUTES', 480); // 8s
const INGESTION_CRITICAL_MIN = parsePosIntMin('MONITOR_INGESTION_CRITICAL_MINUTES', 840); // 14s
if (!(INGESTION_WARNING_MIN < INGESTION_CRITICAL_MIN)) {
  throw new Error(`[monitor] warning (${INGESTION_WARNING_MIN}) < critical (${INGESTION_CRITICAL_MIN}) şartı ihlal edildi`);
}
const INGEST_CRITICAL_AS_DOWN = process.env.INGEST_CRITICAL_AS_DOWN === '1';
const ALERT_WEBHOOK = process.env.ALERT_WEBHOOK_URL || '';
const ALERT_TYPE = process.env.ALERT_WEBHOOK_TYPE || 'generic'; // generic|slack|telegram
const ORIGIN_GUARD_URL = process.env.ORIGIN_GUARD_CHECK_URL || 'https://origin-threats.0rce.com/';
const BUILD_ID = process.env.MONITOR_BUILD_ID || 'unknown';
const RUNBOOK = 'https://github.com/0rce-Labs/threats-0rce/blob/main/docs/monitoring-runbook.md';
const DRY_RUN = process.argv.includes('--dry-run');
const DEBUG = process.env.MONITOR_DEBUG === '1';
const UA = 'threats-production-monitor/1.0';
const TIMEOUT = 20000;

// ---------------- structured JSON log ----------------
function log(level, check, status, message, extra = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    check,
    status,
    durationMs: extra.durationMs ?? 0,
    message,
  };
  if (DEBUG && extra.stack) entry.stack = extra.stack;
  // secret/cookie/auth/body/nonce ASLA loglanmaz (loga alınmadan önce redact)
  console.log(JSON.stringify(entry));
}

// ---------------- state management ----------------
// State: { checks: { [fingerprint]: { status, consecutiveFailures, lastAlertAt, lastSeenAt, lastOkAt, baseline?, firstSeenAt } } }
let state = { checks: {} };

function stateDir() { return STATE_PATH.replace(/\/[^\/]+$/, ''); }

function loadState() {
  if (!existsSync(STATE_PATH)) {
    log('info', 'state', 'init', 'state yok, sıfırdan başlatılıyor');
    return;
  }
  try {
    const raw = readFileSync(STATE_PATH, 'utf8');
    state = JSON.parse(raw);
    if (!state.checks) state.checks = {};
    // bozuk/eksik alanları güvenli onar (monitor çökmesin)
    for (const k of Object.keys(state.checks)) {
      const c = state.checks[k];
      if (!c || typeof c !== 'object') delete state.checks[k];
      else {
        c.consecutiveFailures = Number(c.consecutiveFailures || 0);
        if (typeof c.status !== 'string') delete state.checks[k];
      }
    }
  } catch (e) {
    log('warn', 'state', 'fail', 'state bozuk, yeniden oluşturuluyor: ' + e.message);
    state = { checks: {} };
  }
}

function saveState() {
  if (DRY_RUN) return; // dry-run asla state yazmaz
  try {
    mkdirSync(stateDir(), { recursive: true });
    const tmp = STATE_PATH + '.tmp.' + randomUUID();
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    renameSync(tmp, STATE_PATH); // atomic rename
  } catch (e) {
    log('error', 'state', 'fail', 'state yazılamadı: ' + e.message);
    throw e;
  }
}

// Lock: aynı monitor iki kez paralel çalışmasın
let lockFd = null;
function acquireLock() {
  try {
    mkdirSync(stateDir(), { recursive: true });
    lockFd = openSync(LOCK_PATH, 'wx'); // 'wx' => varsa EEXIST
    // stale lock süresi: 15dk sonra kır (önceki process ölmüş olabilir)
    setTimeout(() => { try { releaseLock(); } catch {} }, 15 * 60 * 1000);
    return true;
  } catch (e) {
    return false; // zaten kilitli
  }
}
function releaseLock() {
  if (lockFd != null) { try { lockFd.closeSync(); } catch {} lockFd = null; }
  try { unlinkSync(LOCK_PATH); } catch {}
}

// ---------------- fingerprint + alarm kararı (core'a delege) ----------------
function fingerprint(checkId, target) {
  return coreFingerprint(checkId, ENV, target);
}

function decideAlarm(checkId, target, severity, okNow) {
  const fp = fingerprint(checkId, target);
  const now = Date.now();
  const r = coreDecide(state.checks, fp, severity, okNow, now, {
    warningThreshold: WARNING_THRESHOLD,
    criticalThreshold: CRITICAL_THRESHOLD,
    cooldownMs: COOLDOWN_SECONDS * 1000,
  });
  const c = r.state;

  switch (r.action) {
    case 'baseline':
      log('info', checkId, 'baseline', `${target} ilk gözlem — alarm yok (baseline)`);
      break;
    case 'recovery':
      saveState();
      emit(severity, checkId, target, 'recovery', c, true);
      log('info', checkId, 'recovery', `${target} tekrar normal`);
      break;
    case 'alert':
      saveState();
      emit(severity, checkId, target, severity, c, false);
      log(severity, checkId, severity, `${target} alarm (${c.consecutiveFailures}. hatada)`);
      break;
    case 'cooldown':
      saveState();
      log('info', checkId, 'cooldown', `${target} cooldown içinde (şimdilik atlandı)`);
      break;
    case 'pending':
      saveState();
      log('info', checkId, 'pending', `${target} eşiğe ulaşmadı (${c.consecutiveFailures}/${severity === 'critical' ? CRITICAL_THRESHOLD : WARNING_THRESHOLD})`);
      break;
    case 'ok':
      // normal ok — state kaydet (recovery dışı)
      saveState();
      break;
  }
}

// ---------------- webhook adapter ----------------
async function emit(severity, checkId, target, status, check, isRecovery) {
  const payload = {
    severity,
    environment: ENV,
    check: checkId,
    target,
    status,
    message: `${checkId} ${status} (${target})`,
    firstSeenAt: check.firstSeenAt ? new Date(check.firstSeenAt).toISOString() : null,
    consecutiveFailures: check.consecutiveFailures || 0,
    lastOkAt: check.lastOkAt ? new Date(check.lastOkAt).toISOString() : null,
    productionUrl: BASE,
    buildId: BUILD_ID,
    runbook: RUNBOOK,
    recovery: isRecovery,
  };

  if (DRY_RUN) {
    // gerçek webhook GÖNDERME; redact edilmiş payload'ı göster
    console.log(`[dry-run] ${isRecovery ? 'RECOVERY' : 'ALERT'} ${severity} ${checkId} ${target}`);
    console.log(`  payload: ${JSON.stringify(redact(payload))}`);
    return;
  }
  if (!ALERT_WEBHOOK) {
    log('info', 'webhook', 'skipped', 'ALERT_WEBHOOK_URL tanımsız — alarm loglandı (bildirim gönderilmedi)', { payload: redact(payload) });
    return;
  }
  const body = formatPayload(payload, ALERT_TYPE);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(ALERT_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) log('error', 'webhook', 'fail', `HTTP ${res.status}`);
    else log('info', 'webhook', 'sent', `${checkId} ${status} bildirildi`);
  } catch (e) {
    log('error', 'webhook', 'fail', 'gönderilemedi: ' + e.message);
  }
}

function formatPayload(p, type) {
  // provider-specific format adapter — generic/slack/telegram
  if (type === 'slack') {
    return { text: `[${p.severity.toUpperCase()}] ${p.check}: ${p.message} (${p.target})`, username: 'threats-monitor' };
  }
  if (type === 'telegram') {
    return { chat_id: p.environment, text: `[${p.severity.toUpperCase()}] ${p.check}: ${p.message}` };
  }
  return p; // generic
}

function redact(o) {
  // secret/cookie/auth/nonce/body asla gönderilmez; iç alanları maskala
  const s = JSON.stringify(o);
  return s.replace(/(token|secret|key|cookie|authorization|nonce)["']?\s*[:=]\s*["']?[A-Za-z0-9_\-\.]{4,}/gi, '$1=***');
}

// ---------------- HTTP helper ----------------
async function httpGet(url, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'user-agent': UA, ...headers }, signal: ctrl.signal, redirect: 'follow' });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, body: buf.toString('utf8') };
  } finally { clearTimeout(t); }
}
const hget = (h, n) => headerGetRaw(h, n);

// lib headerGet Headers nesnesi alır; burada da.
function headerGetRaw(headers, name) {
  for (const [k, v] of headers.entries()) if (k.toLowerCase() === name.toLowerCase()) return v;
  return null;
}

// ---------------- kontrol grupları ----------------
async function checkWarning() {
  const t0 = Date.now();
  // ingestion: /api/health/ready checks.ingestion + status
  // warning_min/critical_min dakika cinsinden (runbook'ta ürün kararı + eşikler).
  const ready = await httpGet(BASE + '/api/health/ready');
  let ingState = null;   // 'ok' | 'warning' | 'critical' | 'invalid' | 'down'
  let readyStatus = null; // 'ok' | 'degraded' | 'critical' | 'down' | 'unknown'
  let srcActive = null, srcHealthy = null;
  if (ready.status === 200 || ready.status === 503) {
    try {
      const j = JSON.parse(ready.body);
      readyStatus = j.status || 'unknown';
      if (j.checks) {
        ingState = j.checks.ingestion || null;
        const sm = j.checks.sources && j.checks.sources.match(/^(\d+)\/(\d+)/);
        if (sm) { srcActive = Number(sm[1]); srcHealthy = Number(sm[2]); }
      }
    } catch {}
  }
  // ingestion: ok=no alarm, warning/critical=alarm, invalid/degraded=güvenli degraded
  const ingOk = ingState === 'ok' || ingState === null; // null/unknown -> önceki baseline; gürültü yapma
  if (ingState === 'critical') {
    decideAlarm('ingestion_stale', '/api/health/ready', 'critical', false);
    log('error', 'ingestion_stale', 'fail', `critical (>=${INGESTION_CRITICAL_MIN}dk / ${(INGESTION_CRITICAL_MIN/60).toFixed(1)}h) ready_status=${readyStatus}`);
  } else if (ingState === 'warning' || ingState === 'invalid') {
    decideAlarm('ingestion_stale', '/api/health/ready', 'warning', false);
    const min = ingState === 'invalid' ? 'invalid timestamp' : `>=${INGESTION_WARNING_MIN}dk / ${(INGESTION_WARNING_MIN/60).toFixed(1)}h`;
    log('warn', 'ingestion_stale', 'fail', `warning (${min}) ready_status=${readyStatus}`);
  } else {
    decideAlarm('ingestion_stale', '/api/health/ready', 'warning', ingOk);
    log(ingOk ? 'info' : 'warn', 'ingestion_stale', ingOk ? 'pass' : 'fail', `ok state=${ingState} ready_status=${readyStatus}`);
  }
  if (srcActive != null && srcHealthy != null) {
    decideAlarm('sources_mismatch', 'sources', 'warning', srcHealthy === srcActive);
    log(srcHealthy === srcActive ? 'info' : 'warn', 'sources_mismatch', 'pass/fail', `${srcActive}/${srcHealthy}`);
  }
  // worker feed cache HIT (warm + 2. istek)
  await httpGet(BASE + '/feed', { 'accept': 'text/html,application/xhtml+xml' });
  await sleep(300);
  const f2 = await httpGet(BASE + '/feed', { 'accept': 'text/html,application/xhtml+xml' });
  const f3 = await httpGet(BASE + '/feed', { 'accept': 'text/html,application/xhtml+xml' });
  const st2 = headerGetRaw(f2.headers, 'server-timing') || '';
  const st3 = headerGetRaw(f3.headers, 'server-timing') || '';
  const hit = /cache;desc="?HIT/.test(st2) || /cache;desc="?HIT/.test(st3);
  decideAlarm('worker_cache_hit', '/feed', 'warning', hit);
  log(hit ? 'info' : 'warn', 'worker_cache_hit', hit ? 'pass' : 'fail', hit ? 'HIT' : 'MISS');
  const pst = parseServerTiming(st2 + ',' + st3);
  if (pst.workerDur != null && pst.cache === 'HIT' && pst.workerDur > 250) {
    decideAlarm('cache_worker_slow', '/feed', 'warning', false);
    log('warn', 'cache_worker_slow', 'fail', `HIT cfWorker ${pst.workerDur}ms > 250ms`);
  } else {
    decideAlarm('cache_worker_slow', '/feed', 'warning', true);
  }
  // canonical/OG metadata
  const meta = seoMeta(homeBody());
  decideAlarm('seo_meta', '/', 'warning', meta.hasAll);
  log(meta.hasAll ? 'info' : 'warn', 'seo_meta', meta.hasAll ? 'pass' : 'fail');
  // HOME body'yi yeniden getirme (performans) — home zaten critical'de çekilmişti
}

let _homeBody = null;
function homeBody() {
  return _homeBody;
}

// ---------------- ana ----------------
async function main() {
  log('info', 'monitor', 'start', `BASE=${BASE} env=${ENV} dry=${DRY_RUN} state=${STATE_PATH}`);
  if (ALERT_WEBHOOK && !DRY_RUN) {
    // webhook url'sini asla loglama
    log('info', 'webhook', 'cfg', `ALERT_WEBHOOK_URL tanımlı (type=${ALERT_TYPE})`);
  } else {
    log('info', 'webhook', 'cfg', DRY_RUN ? 'dry-run: webhook gönderilmeyecek' : 'ALERT_WEBHOOK_URL tanımsız');
  }

  loadState();
  if (!acquireLock()) {
    log('warn', 'monitor', 'lock', 'başka bir monitor çalışıyor — çıkılıyor');
    process.exit(0);
  }
  try {
    // critical kontroller + home body'yi register et
    await checkCriticalLight();
    await checkWarning();

    // baseline: ilk koşuda eğer hiç veri yoksa alarm üretme (dramatic-change)
    if (DRY_RUN) {
      console.log('\n[dry-run] STATE şu an yazılmadı (dry-run). Dry-run çıktısı tamam.');
      console.log('[dry-run] State path:', STATE_PATH);
    } else {
      saveState();
    }
  } finally {
    releaseLock();
  }
  log('info', 'monitor', 'done', 'monitor tamam');
  process.exit(0);
}

// critical kontrolleri home body register ile basitleştir
async function checkCriticalLight() {
  const home = await httpGet(BASE + '/', { 'accept': 'text/html,application/xhtml+xml' });
  _homeBody = home.body;
  decideAlarm('home_http', '/', 'critical', home.status === 200);
  log(home.status === 200 ? 'info' : 'error', 'home_http', home.status === 200 ? 'pass' : 'fail', `HTTP ${home.status}`);

  const live = await httpGet(BASE + '/api/health/live');
  decideAlarm('health_live', '/api/health/live', 'critical', live.status === 200);
  log(live.status === 200 ? 'info' : 'error', 'health_live', live.status === 200 ? 'pass' : 'fail', `HTTP ${live.status}`);

  const ready = await httpGet(BASE + '/api/health/ready');
  decideAlarm('health_ready', '/api/health/ready', 'critical', ready.status === 200);
  log(ready.status === 200 ? 'info' : 'error', 'health_ready', ready.status === 200 ? 'pass' : 'fail', `HTTP ${ready.status}`);

  const csp = headerGetRaw(home.headers, 'content-security-policy') || '';
  const n = cspNonce(csp);
  const cspOk = !!n && !/unsafe-inline|unsafe-eval/.test(csp);
  decideAlarm('csp_nonce', '/', 'critical', cspOk);
  log(cspOk ? 'info' : 'error', 'csp_nonce', cspOk ? 'pass' : 'fail', `nonce=${!!n} unsafe=${/unsafe-inline|unsafe-eval/.test(csp)}`);

  const sns = scriptNonces(home.body);
  const matched = sns.some(s => s !== null && s === n);
  decideAlarm('nonce_match', '/', 'critical', matched && sns.length > 0);
  log(matched ? 'info' : 'error', 'nonce_match', matched ? 'pass' : 'fail', `scripts=${sns.length} match=${matched}`);

  const og = await httpGet(ORIGIN_GUARD_URL, { 'accept': '*/*' });
  const ogOk = og.status === 403 || og.status === 404;
  decideAlarm('origin_guard', ORIGIN_GUARD_URL, 'critical', ogOk);
  log(ogOk ? 'info' : 'error', 'origin_guard', ogOk ? 'pass' : 'fail', `HTTP ${og.status}`);

  const cve = await httpGet(BASE + '/cve/CVE-2026-64865', { 'accept': 'text/html,application/xhtml+xml' });
  const ghIoc = /github\.com/.test(cve.body);
  decideAlarm('github_ioc', '/cve/CVE-2026-64865', 'critical', !ghIoc);
  log(!ghIoc ? 'info' : 'error', 'github_ioc', !ghIoc ? 'pass' : 'fail', ghIoc ? 'iyi değil' : 'yok');
}

main().catch((e) => {
  log('error', 'monitor', 'fail', e.message, { stack: DEBUG ? e.stack : undefined });
  process.exit(2);
});
