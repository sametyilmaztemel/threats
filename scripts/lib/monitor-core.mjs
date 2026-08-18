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
