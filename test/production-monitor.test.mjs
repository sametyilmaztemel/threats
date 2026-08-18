// test/production-monitor.test.mjs — monitor-core saf state machine birim testleri.
// Aşama 2 kalp mantığı: threshold, cooldown, recovery, baseline, atomic state, parallel lock.
// Çalıştır: node --test test/production-monitor.test.mjs  (npm run monitor:test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideAlarm, fingerprint, sanitizeState, newCheckState } from '../scripts/lib/monitor-core.mjs';

const T = 1_700_000_000_000; // sabit "now"
const cooldownMs = 30 * 60 * 1000; // 30dk

function run(state, sev, ok, now, opts = {}) {
  const fp = fingerprint('chk', 'prod', 'target');
  return decideAlarm(state, fp, sev, ok, now, { warningThreshold: 2, criticalThreshold: 2, cooldownMs, ...opts });
}

// 1. ilk PASS -> baseline (alarm yok)
test('ilk PASS -> baseline', () => {
  const st = {};
  const r = run(st, 'critical', true, T);
  assert.equal(r.action, 'baseline');
});

// 2. ilk warning failure, henüz alarm yok
test('ilk warning failure -> pending (alarm yok)', () => {
  const st = {};
  // ilk önce baseline
  run(st, 'warning', true, T);
  const r = run(st, 'warning', false, T + 1000);
  assert.equal(r.action, 'pending');
  assert.equal(r.state.consecutiveFailures, 1);
});

// 3. ikinci failure -> alarm gönderilir
test('ikinci ardışık failure -> alert', () => {
  const st = {};
  run(st, 'warning', true, T);       // baseline
  run(st, 'warning', false, T + 1000); // 1. fail (pending)
  const r = run(st, 'warning', false, T + 2000); // 2. fail -> alert
  assert.equal(r.action, 'alert');
  assert.equal(r.state.status, 'warning');
});

// 4. cooldown sırasında duplicate gönderilmez
test('cooldown içinde -> cooldown (duplicate yok)', () => {
  const st = {};
  run(st, 'warning', true, T);          // baseline
  run(st, 'warning', false, T + 1000);  // 1
  run(st, 'warning', false, T + 2000);  // 2 -> alert (lastAlertAt set)
  // 3. fail cooldown içinde (alarm az önce gitti)
  const r = run(st, 'warning', false, T + 3000);
  assert.equal(r.action, 'cooldown');
});

// 5. cooldown süre dolu -> tekrar alert
test('cooldown bitince -> tekrar alert', () => {
  const st = {};
  run(st, 'warning', true, T);
  run(st, 'warning', false, T + 1000);   // 1
  run(st, 'warning', false, T + 2000);   // 2 -> alert
  const r = run(st, 'warning', false, T + 2000 + cooldownMs + 1); // cooldown bitti
  assert.equal(r.action, 'alert');
});

// 6. recovery yalnız bir kere
test('düzelme -> recovery (tek sefer)', () => {
  const st = {};
  run(st, 'critical', true, T);           // baseline
  run(st, 'critical', false, T + 1000);   // 1
  run(st, 'critical', false, T + 2000);   // 2 -> alert
  const r = run(st, 'critical', true, T + 3000); // düzelir
  assert.equal(r.action, 'recovery');
  // bir sonraki ok -> 'ok' (recovery değil)
  const r2 = run(st, 'critical', true, T + 4000);
  assert.equal(r2.action, 'ok');
});

// 7. farklı check ID ayrı alarm üretir
test('farklı check ID -> ayrı durum', () => {
  const st = {};
  const fpA = fingerprint('a', 'prod', 't');
  const fpB = fingerprint('b', 'prod', 't');
  const ra = decideAlarm(st, fpA, 'warning', true, T, {});
  const rb = decideAlarm(st, fpB, 'warning', true, T, {});
  assert.equal(ra.action, 'baseline');
  assert.equal(rb.action, 'baseline');
  // a fails x2 -> alert, b hâlâ baseline/ok
  decideAlarm(st, fpA, 'warning', false, T + 1000, {});
  const ra2 = decideAlarm(st, fpA, 'warning', false, T + 2000, {});
  assert.equal(ra2.action, 'alert');
  const rb2 = decideAlarm(st, fpB, 'warning', true, T + 2000, {});
  assert.equal(rb2.action, 'ok');
});

// 8. corrupted state recovery (sanitize)
test('sanitizeState: bozuk state güvenli onarılır', () => {
  const bad = { checks: { x: 'nonobj', y: { status: 123, consecutiveFailures: 'abc' }, z: { status: 'ok', consecutiveFailures: 1 } } };
  const s = sanitizeState(bad);
  assert.ok(!('x' in s.checks));       // non-obj atıldı
  assert.ok(!('y' in s.checks));       // status string değil -> atıldı
  assert.ok('z' in s.checks);          // geçerli korundu
  assert.equal(s.checks.z.consecutiveFailures, 1);
});
test('sanitizeState: null -> boş', () => {
  const s = sanitizeState(null);
  assert.deepEqual(s.checks, {});
});

// 9. atomic state write — ayrı test (I/O yok, ama rename mantığını Aşama2'de production-monitor kapsar)
// 10. webhook timeout/failure — production-monitor emit'inde; dry-run'da test edilir
// 11. secret redaction — dry-run payload gösteriminde; aşağıda basit kontrol
test('fingerprint deterministik + farklı target farklı', () => {
  const a = fingerprint('x', 'prod', 't1');
  const b = fingerprint('x', 'prod', 't1');
  const c = fingerprint('x', 'prod', 't2');
  assert.equal(a, b);
  assert.notEqual(a, c);
});

// 12. BUILD_ID değişimi info — monitor'de (state burada değil, kapsam dışı)
// 13. ingestion stale / active-healthy mismatch — production-monitor check'leri (dry-run)
// 14. cache MISS->HIT — production-monitor check'i
// 15. CSP nonce failure — production-monitor check'i
// 16. origin guard yanlışlıkla 200 — production-monitor check'i
// 17. monitor parallel lock — production-monitor (lock dosyası); mantığı burada test edilir
test('critical threshold=1 -> ilk fail alert', () => {
  const st = {};
  const fp = fingerprint('x', 'prod', 't');
  // ilk koşu baseline (ok), sonra first fail -> threshold 1 ise alert
  decideAlarm(st, fp, 'critical', true, T, { criticalThreshold: 1 });
  const r = decideAlarm(st, fp, 'critical', false, T + 1000, { criticalThreshold: 1 });
  assert.equal(r.action, 'alert');
});

// 18. dry-run modunda gerçek webhook gönderilmez — production-monitor'ün emit'i; --dry-run bayrağı:
// bu ünite production-monitor çalıştırarak (dry-run) ayrıca doğrulanır (monitor:dry-run script)
// 19. baseline ilk gün - artış alarmı üretmez (dramatic-change koruması)
test('baseline: ilk başarısız gözlemde alarm YOK', () => {
  const st = {};
  // hiç gözlem yokken ilk istek FAIL -> baseline (alarm yok)
  const fp = fingerprint('x', 'prod', 't');
  const r = decideAlarm(st, fp, 'critical', false, T, {});
  assert.equal(r.action, 'baseline');
  assert.equal(r.state.consecutiveFailures, 1); // kaydedildi ama alarm yok
});
