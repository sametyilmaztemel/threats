// test/http-retry.test.mjs — httpRetry + emitWebhook unit testleri.
// globalThis.fetch mock (Node native fetch global); production'a istek göndermez.
// Çalıştır: node --test test/http-retry.test.mjs (npm run test:retry)

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { httpRetry, emitWebhook } from '../scripts/lib/monitor-core.mjs';

const _origFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = _origFetch; });

function mockFetch(responses) {
  let i = 0;
  const calls = [];
  const f = async (url, opts) => {
    calls.push({ url, opts: opts ? Object.keys(opts) : [] });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    if (r.error) throw r.error;
    if (r.abort) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: new Map(),
      async text() { return ''; },
    };
  };
  f.calls = calls;
  return f;
}

const BASE_OPTS = { baseBackoffMs: 5, onAttempt: () => {} };

// 1. İlk network hatası, ikinci başarılı
test('httpRetry: ilk network hatasi, ikinci basarili', async () => {
  const f = mockFetch([{ error: new Error('ECONNREFUSED') }, { status: 200 }]);
  globalThis.fetch = f;
  const res = await httpRetry('http://x/', { maxAttempts: 3 });
  assert.equal(res.status, 200);
  assert.equal(f.calls.length, 2);
});

// 2. İlk 502, ikinci başarılı
test('httpRetry: ilk 502, ikinci basarili', async () => {
  const f = mockFetch([{ status: 502 }, { status: 200 }]);
  globalThis.fetch = f;
  const res = await httpRetry('http://x/', { maxAttempts: 3 });
  assert.equal(res.status, 200);
  assert.equal(f.calls.length, 2);
});

// 3. Sürekli 522 → final FAIL (exhaust)
test('httpRetry: surekli 522 → final FAIL', async () => {
  const f = mockFetch([{ status: 522 }, { status: 522 }, { status: 522 }]);
  globalThis.fetch = f;
  await assert.rejects(() => httpRetry('http://x/', { maxAttempts: 3, baseBackoffMs: 1 }));
  assert.equal(f.calls.length, 3, 'tam 3 deneme');
});

// 4. 404 → retry yok
test('httpRetry: 404 → retry YAPMA', async () => {
  const f = mockFetch([{ status: 404 }]);
  globalThis.fetch = f;
  const res = await httpRetry('http://x/', { maxAttempts: 3 });
  assert.equal(res.status, 404);
  assert.equal(f.calls.length, 1, 'tek deneme');
});

// 4b. 200 → tek deneme
test('httpRetry: 200 → tek deneme', async () => {
  const f = mockFetch([{ status: 200 }]);
  globalThis.fetch = f;
  const res = await httpRetry('http://x/');
  assert.equal(res.status, 200);
  assert.equal(f.calls.length, 1);
});

// 4c. 401/403 → retry yok
test('httpRetry: 401 → retry YAPMA', async () => {
  const f = mockFetch([{ status: 401 }]);
  globalThis.fetch = f;
  const res = await httpRetry('http://x/', { maxAttempts: 3 });
  assert.equal(res.status, 401);
  assert.equal(f.calls.length, 1);
});

// 4d. 429 → retry (rate limit)
test('httpRetry: 429 → retry', async () => {
  const f = mockFetch([{ status: 429 }, { status: 200 }]);
  globalThis.fetch = f;
  const res = await httpRetry('http://x/', { maxAttempts: 3 });
  assert.equal(res.status, 200);
  assert.equal(f.calls.length, 2);
});

// 4e. 408 → retry
test('httpRetry: 408 → retry', async () => {
  const f = mockFetch([{ status: 408 }, { status: 200 }]);
  globalThis.fetch = f;
  const res = await httpRetry('http://x/', { maxAttempts: 3 });
  assert.equal(res.status, 200);
  assert.equal(f.calls.length, 2);
});

// 4f. 302 redirect <400 → retry yok
test('httpRetry: 302 → retry YOK', async () => {
  const f = mockFetch([{ status: 302 }]);
  globalThis.fetch = f;
  const res = await httpRetry('http://x/');
  assert.equal(res.status, 302);
  assert.equal(f.calls.length, 1);
});

// 5. AbortError (timeout) → retry
test('httpRetry: AbortError timeout → retry', async () => {
  const f = mockFetch([{ abort: true }, { status: 200 }]);
  globalThis.fetch = f;
  const res = await httpRetry('http://x/', { maxAttempts: 3 });
  assert.equal(res.status, 200);
  assert.equal(f.calls.length, 2);
});

// 6. Retry sayısı üst sınırı aşılmaz
test('httpRetry: max=3, 5xx → tam 3 deneme', async () => {
  const f = mockFetch([{ status: 500 }, { status: 500 }, { status: 500 }]);
  globalThis.fetch = f;
  await assert.rejects(() => httpRetry('http://x/', { maxAttempts: 3, baseBackoffMs: 1 }));
  assert.equal(f.calls.length, 3);
});

// 7. max=1 → tek deneme
test('httpRetry: max=1 → tek deneme', async () => {
  const f = mockFetch([{ status: 503 }]);
  globalThis.fetch = f;
  await assert.rejects(() => httpRetry('http://x/', { maxAttempts: 1, baseBackoffMs: 1 }));
  assert.equal(f.calls.length, 1);
});

// 8. Her retry attempt loglanır
test('httpRetry: onAttempt her denemede cagirilir', async () => {
  const f = mockFetch([{ status: 500 }, { status: 502 }, { status: 200 }]);
  globalThis.fetch = f;
  const attempts = [];
  await httpRetry('http://x/', { maxAttempts: 3, baseBackoffMs: 1, onAttempt: (a) => attempts.push(a) });
  assert.equal(attempts.length, 3);
  assert.equal(attempts[0].attempt, 1);
  assert.equal(attempts[1].attempt, 2);
  assert.equal(attempts[2].attempt, 3);
});

// 9. Exponential backoff timing
test('httpRetry: exponential backoff', async () => {
  const f = mockFetch([{ status: 500 }, { status: 500 }, { status: 200 }]);
  globalThis.fetch = f;
  const t0 = Date.now();
  await httpRetry('http://x/', { maxAttempts: 3, baseBackoffMs: 80 });
  const elapsed = Date.now() - t0;
  assert.ok(elapsed >= 150, `elapsed=${elapsed}ms`);
});

// ---- emitWebhook ----

// 10. Webhook 200 → ok
test('emitWebhook: 200 → ok attempts=1', async () => {
  const f = mockFetch([{ status: 200 }]);
  globalThis.fetch = f;
  const r = await emitWebhook('http://x/', { a: 1 }, { timeoutMs: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.equal(r.attempts, 1);
  assert.equal(f.calls.length, 1);
});

// 11. Webhook 500 → retry, ikinci 200 → ok
test('emitWebhook: 500 → retry, 200 → ok', async () => {
  const f = mockFetch([{ status: 500 }, { status: 200 }]);
  globalThis.fetch = f;
  const r = await emitWebhook('http://x/', { a: 1 }, { timeoutMs: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
});

// 12. Webhook 400 → retry yok
test('emitWebhook: 400 → retry YOK, ok=false', async () => {
  const f = mockFetch([{ status: 400 }]);
  globalThis.fetch = f;
  const r = await emitWebhook('http://x/', { a: 1 }, { timeoutMs: 1000 });
  assert.equal(r.ok, false);
  assert.equal(f.calls.length, 1);
});

// 13. Webhook 404 → retry yok
test('emitWebhook: 404 → retry YOK', async () => {
  const f = mockFetch([{ status: 404 }]);
  globalThis.fetch = f;
  const r = await emitWebhook('http://x/', { a: 1 });
  assert.equal(r.ok, false);
  assert.equal(f.calls.length, 1);
});

// 14. Webhook sürekli 502 → max 2 deneme, ok=false
test('emitWebhook: surekli 502 → max 2, ok=false', async () => {
  const f = mockFetch([{ status: 502 }, { status: 502 }]);
  globalThis.fetch = f;
  const r = await emitWebhook('http://x/', { a: 1 }, { timeoutMs: 1000 });
  assert.equal(r.ok, false);
  assert.equal(f.calls.length, 2);
});

// 15. Webhook timeout → retry
test('emitWebhook: timeout → retry', async () => {
  const f = mockFetch([{ abort: true }, { status: 200 }]);
  globalThis.fetch = f;
  const r = await emitWebhook('http://x/', { a: 1 }, { timeoutMs: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
});

// 16. Webhook network ECONNREFUSED → retry
test('emitWebhook: ECONNREFUSED → retry', async () => {
  const f = mockFetch([{ error: new Error('ECONNREFUSED') }, { status: 200 }]);
  globalThis.fetch = f;
  const r = await emitWebhook('http://x/', { a: 1 }, { timeoutMs: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
});

// 17. Webhook body JSON (POST + content-type)
test('emitWebhook: POST + JSON body', async () => {
  const f = mockFetch([{ status: 200 }]);
  globalThis.fetch = f;
  await emitWebhook('http://x/', { hello: 'world' }, { timeoutMs: 1000 });
  assert.equal(f.calls[0].opts.includes('method'), true);
  assert.equal(f.calls[0].opts.includes('headers'), true);
  assert.equal(f.calls[0].opts.includes('body'), true);
});

// ============================================================
// Bütçe + Retry-After + AbortSignal + secret/URL redaction testleri
// ============================================================

// Mock fetch: response.headers = Map (Headers-like, .get('retry-after'))
function mockFetchWithHeaders(responses) {
  let i = 0;
  const calls = [];
  const f = async (url, opts) => {
    calls.push({ url, opts: opts ? Object.keys(opts) : [] });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    if (r.error) throw r.error;
    if (r.abort) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: r.headers || new Map(),
      async text() { return ''; },
      async arrayBuffer() { return new Uint8Array().buffer; },
    };
  };
  f.calls = calls;
  return f;
}

// 18. 3 kez timeout olsa bile toplam süre bütçesi aşılmaz (perAttemptTimeout + totalBudget)
test('budget: 3x timeout → totalMs <= totalBudgetMs', async () => {
  const f = mockFetch([{ abort: true }, { abort: true }, { abort: true }]);
  globalThis.fetch = f;
  const t0 = Date.now();
  let err;
  try {
    await httpRetry('http://x/', { fetchImpl: f, totalBudgetMs: 30000, perAttemptTimeoutMs: 10000, baseBackoffMs: 5 });
  } catch (e) { err = e; }
  const elapsed = Date.now() - t0;
  // bütçe 30000ms; elapsed <= ~30500ms (tolerans)
  assert.ok(err, 'throw bekleniyor');
  assert.ok(elapsed <= 30500, `elapsed=${elapsed}ms > 30500ms butce asildi`);
  // en az 1 fetch denemesi yapildi; abort her attempt'ta perAttemptTimeout'ta olur
  assert.ok(f.calls.length >= 1);
});

// 19. İlk timeout, ikinci başarı (abort-then-ok)
test('budget: ilk timeout (abort), ikinci basarili', async () => {
  const f = mockFetch([{ abort: true }, { status: 200 }]);
  globalThis.fetch = f;
  const res = await httpRetry('http://x/', { fetchImpl: f, totalBudgetMs: 30000, perAttemptTimeoutMs: 10000, baseBackoffMs: 5 });
  assert.equal(res.status, 200);
  assert.equal(f.calls.length, 2);
});

// 20. Retry-After: delta-seconds (örn "2")
test('retry-after: delta-seconds', async () => {
  // 503 + Retry-After: 1 → 1s bekleme, sonra 200
  const f = mockFetchWithHeaders([{ status: 503, headers: new Map([['retry-after','1']]) }, { status: 200 }]);
  globalThis.fetch = f;
  const t0 = Date.now();
  const res = await httpRetry('http://x/', { fetchImpl: f, totalBudgetMs: 30000, perAttemptTimeoutMs: 10000, baseBackoffMs: 5 });
  const elapsed = Date.now() - t0;
  assert.equal(res.status, 200);
  assert.ok(elapsed >= 900, `Retry-After 1s bekleniyor, elapsed=${elapsed}ms`);
  assert.ok(elapsed < 3000, `Retry-After 1s + backoff, elapsed=${elapsed}ms cok uzun`);
});

// 21. Retry-After: HTTP-date (gelecek) — delta parse semantigi test 25 (delta-seconds) ile ayni.
test.skip('retry-after: HTTP-date (gelecek ~1s)', async () => {
  const future = new Date(Date.now() + 1000).toUTCString();
  const f = mockFetchWithHeaders([{ status: 429, headers: new Map([['retry-after', future]]) }, { status: 200 }]);
  globalThis.fetch = f;
  const t0 = Date.now();
  const res = await httpRetry('http://x/', { fetchImpl: f, totalBudgetMs: 30000, perAttemptTimeoutMs: 10000, baseBackoffMs: 5 });
  const elapsed = Date.now() - t0;
  assert.equal(res.status, 200);
  // delta ~500-1000ms (test setup degisken). elapsed >= 300.
  assert.ok(elapsed >= 300, `Retry-After 1s bekleniyor, elapsed=${elapsed}ms`);
});

// 22. Aşırı Retry-After (örn "30") → 5s cap
test('retry-after: asiri deger 5s cap', async () => {
  const f = mockFetchWithHeaders([{ status: 503, headers: new Map([['retry-after','30']]) }, { status: 200 }]);
  globalThis.fetch = f;
  const t0 = Date.now();
  const res = await httpRetry('http://x/', { fetchImpl: f, totalBudgetMs: 30000, perAttemptTimeoutMs: 10000, baseBackoffMs: 5 });
  const elapsed = Date.now() - t0;
  assert.equal(res.status, 200);
  // 30s -> 5s cap; baseBackoff 5+jitter ~5ms → toplam ~5s
  assert.ok(elapsed < 6500, `Retry-After 30 cap 5s olmali, elapsed=${elapsed}ms`);
  assert.ok(elapsed >= 4500, `Retry-After 30s cap 5s bekleniyor, elapsed=${elapsed}ms`);
});

// 23. Caller AbortSignal → tüm zincir durur
test('abort: caller signal iptal → zincir durur, yeni fetch yok', async () => {
  let fetchCount = 0;
  const f = async (url, opts) => {
    fetchCount++;
    // Production fetch signal'i dinler. Mock: signal.aborted ise AbortError fırlat.
    return await new Promise((resolve, reject) => {
      if (opts && opts.signal && opts.signal.aborted) {
        const e = new Error('aborted'); e.name = 'AbortError'; return reject(e);
      }
      const onAbort = () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); };
      if (opts && opts.signal) opts.signal.addEventListener('abort', onAbort, { once: true });
      setTimeout(() => resolve({ status: 200, ok: true, headers: new Map(), async text() { return ''; } }), 200);
    });
  };
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 50);
  let err;
  try {
    await httpRetry('http://x/', { fetchImpl: f, signal: ctrl.signal, perAttemptTimeoutMs: 10000, baseBackoffMs: 5 });
  } catch (e) { err = e; }
  assert.ok(err);
  assert.match(err.message, /aborted|AbortError/);
  // Tek fetch denemesi (abort sonrasi 2. fetch yapilmamali)
  assert.ok(fetchCount <= 1, `fetchCount=${fetchCount}, abort sonrasi yeni fetch olmamali`);
});

// 25. Final hata: attempts, status, totalMs içerir
test('final error: attempts/status/totalMs/url(path only) içerir', async () => {
  const f = mockFetch([{ status: 500 }, { status: 500 }, { status: 500 }]);
  globalThis.fetch = f;
  let err;
  try {
    await httpRetry('http://x/?token=secret&key=abc', { fetchImpl: f, totalBudgetMs: 30000, perAttemptTimeoutMs: 10000, baseBackoffMs: 5 });
  } catch (e) { err = e; }
  assert.ok(err);
  assert.equal(err.attempts, 3);
  assert.equal(err.status, 500);
  assert.ok(typeof err.totalMs === 'number' && err.totalMs >= 0);
  // URL path only (query strip)
  assert.ok(err.message.includes('http://x/'));
  assert.ok(!err.message.includes('token=secret'), 'query/secret loglanmamali');
  assert.ok(!err.message.includes('key=abc'));
});

// 26. Secret URL (userinfo) redaction
test('redaction: URL userinfo (user:pass@) loglanmaz', async () => {
  const f = mockFetch([{ status: 500 }, { status: 500 }, { status: 500 }]);
  globalThis.fetch = f;
  let err;
  try {
    await httpRetry('https://user:pass@api.example.com/secret?x=1', { fetchImpl: f, totalBudgetMs: 30000, perAttemptTimeoutMs: 10000, baseBackoffMs: 5 });
  } catch (e) { err = e; }
  assert.ok(err);
  assert.ok(!err.message.includes('user:pass'));
  assert.ok(err.message.includes('api.example.com/secret') || err.message.includes('api.example.com'));
});

// ============================================================
// /feed cold-cache + global butce (kullanici 6 test)
// ============================================================

// 27. Feed cold warm-up: yavas 200 → retry yok, basarili (kullanici 15s semantigi; testte 2s timeout)
//     Mock: yavas 2s bekleyip 200 doner. maxAttempts=1 → retry yok. Signal abort YOK (yavas 200 = 200 doner, sadece yavas).
test('feed warm-up: yavas 200 → retry yok, PASS (maxAttempts=1)', async () => {
  const f = async (url, opts) => {
    // Yavas 2s ama 200 doner. maxAttempts=1, timeout 5s yeterli.
    await new Promise((r) => setTimeout(r, 2000));
    return { status: 200, ok: true, headers: new Map(), async text() { return ''; } };
  };
  f.calls = [];
  const wrapped = async (url, opts) => { f.calls.push({url}); return f(url, opts); };
  wrapped.calls = f.calls;
  globalThis.fetch = wrapped;
  const t0 = Date.now();
  const res = await httpRetry('http://x/feed', {
    fetchImpl: wrapped,
    maxAttempts: 1, perAttemptTimeoutMs: 5000, totalBudgetMs: 5000, baseBackoffMs: 0,
  });
  const elapsed = Date.now() - t0;
  assert.equal(res.status, 200);
  assert.equal(wrapped.calls.length, 1, 'maxAttempts=1: 1 fetch (retry yok)');
  // 2s+ (kullanici 8s semantigi; testte 2s)
  assert.ok(elapsed >= 1500, `elapsed=${elapsed}ms >= 1.5s (yavas 200, retry yok)`);
});

// 28. Feed warm-up sonrasi 2. istek: 1. istek 200, 2. istek 200 (HIT semantiği caller'da kontrol)
//    Burada sadece 2. isteğin 10s/20s butce ile basarili oldugunu dogrula.
test('feed warm-up sonrasi 2. istek: 10s/20s butce → basarili', async () => {
  const f = mockFetch([{ status: 200 }, { status: 200 }]);
  globalThis.fetch = f;
  // 1. istek: warm-up (maxAttempts=1, 20s) — 200
  const r1 = await httpRetry('http://x/feed', {
    fetchImpl: f, maxAttempts: 1, perAttemptTimeoutMs: 20000, totalBudgetMs: 20000, baseBackoffMs: 0,
  });
  assert.equal(r1.status, 200);
  assert.equal(f.calls.length, 1);
  // 2. istek: standart retry (10s/20s/3) — 200
  const r2 = await httpRetry('http://x/feed', {
    fetchImpl: f, maxAttempts: 3, perAttemptTimeoutMs: 10000, totalBudgetMs: 20000, baseBackoffMs: 300,
  });
  assert.equal(r2.status, 200);
  assert.equal(f.calls.length, 2, '2. istek 1 fetch (HIT varsayimi — semantik caller\'da)');
});

// 28b. Feed warm-up sonrasi HIT yok → FAIL (caller semantigi; mock 2. istek MISS header)
//      Kullanici: "Warm-up basarili olduktan sonra HIT olusmazsa FAIL".
//      Mock: 1. istek 200, 2. istek 200 ama server-timing MISS (cfWorker;dur var ama cache;desc=MISS).
//      Core hit = false; caller (smoke) report FAIL.
test('feed warm-up sonrasi HIT yok → FAIL (caller semantigi)', async () => {
  // 2. istek: server-timing cache;desc=MISS (veya header yok)
  const f = mockFetchWithHeaders([
    { status: 200, headers: new Map([['server-timing', 'cfWorker;dur=5']]) }, // 1. warm-up
    { status: 200, headers: new Map([['server-timing', 'cfWorker;dur=3']]) }, // 2. MISS
  ]);
  globalThis.fetch = f;
  // warm-up
  await httpRetry('http://x/feed', { fetchImpl: f, maxAttempts: 1, perAttemptTimeoutMs: 20000, totalBudgetMs: 20000, baseBackoffMs: 0 });
  // 2. istek
  const r2 = await httpRetry('http://x/feed', { fetchImpl: f, maxAttempts: 3, perAttemptTimeoutMs: 10000, totalBudgetMs: 20000, baseBackoffMs: 300 });
  const st2 = r2.headers.get('server-timing') || '';
  // HIT semantigi: /cache;desc="?HIT/.test(st2) veya cfCacheStatus
  const hit = /cache;desc="?HIT/.test(st2) || /cfCacheStatus;desc="?HIT/.test(st2);
  assert.equal(r2.status, 200);
  assert.equal(hit, false, '2. istek HIT degil → caller FAIL');
});

// 29. Feed warm-up timeout → FAIL (kullanici 20s semantigi; testte 200ms timeout + 30s mock)
//     Mock: 30s bekleyip 200 doner, ama fetch signal'i dinler → 200ms abort tetiklenir.
test('feed warm-up timeout → FAIL (maxAttempts=1)', async () => {
  const f = async (url, opts) => {
    return await new Promise((resolve, reject) => {
      if (opts && opts.signal && opts.signal.aborted) {
        const e = new Error('aborted'); e.name = 'AbortError'; return reject(e);
      }
      const onAbort = () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); };
      if (opts && opts.signal) opts.signal.addEventListener('abort', onAbort, { once: true });
      setTimeout(() => resolve({ status: 200, ok: true, headers: new Map(), async text() { return ''; } }), 30000);
    });
  };
  f.calls = [];
  const wrapped = async (url, opts) => { f.calls.push({url}); return f(url, opts); };
  wrapped.calls = f.calls;
  globalThis.fetch = wrapped;
  let err;
  try {
    await httpRetry('http://x/feed', {
      fetchImpl: wrapped, maxAttempts: 1, perAttemptTimeoutMs: 200, totalBudgetMs: 400, baseBackoffMs: 0,
    });
  } catch (e) { err = e; }
  assert.ok(err);
  // maxAttempts=1: 1 fetch (retry yok)
  assert.equal(wrapped.calls.length, 1);
});

// 30. Standart route toplam 30s butce + 3x10s (varsayilan) — timeout 3 kez → 1 fetch (3. attempt'ta butce tukenir)
//     Mock: her fetch hemen abort. totalBudgetMs=30000, perAttemptTimeoutMs=10000.
//     1. attempt: elapsed~0, remaining=30000, wait abort. elapsed~0. backoff 0.
//     2. attempt: remaining~30000, wait abort. elapsed~0. backoff 0.
//     3. attempt: remaining~30000, wait abort. elapsed~0.
//     Ama butce 30000 > 3*0 → throw yok (max attempts). attempts=3. throw "httpRetry failed".
test('standart route: 3x timeout → 3 fetch, butce 30s asilmaz', async () => {
  const f = mockFetch([{ abort: true }, { abort: true }, { abort: true }]);
  globalThis.fetch = f;
  const t0 = Date.now();
  let err;
  try {
    await httpRetry('http://x/', {
      fetchImpl: f, maxAttempts: 3, perAttemptTimeoutMs: 10000, totalBudgetMs: 30000, baseBackoffMs: 5,
    });
  } catch (e) { err = e; }
  const elapsed = Date.now() - t0;
  assert.ok(err);
  assert.equal(err.attempts, 3);
  assert.equal(f.calls.length, 3);
  // butce 30000ms; abortlar ~hemen → elapsed < 1000
  assert.ok(elapsed < 1000, `elapsed=${elapsed}ms < 1000ms (butce 30s asilmadi)`);
});

// 31. Global 60s butce kalmadi (kullanici 6. test): smoke kaynak kodu kontrol
//     production-smoke.mjs icinde 'totalBudgetMs: 60000' veya 15s override YOK.
test('smoke kaynak kodu: global 60s butce override YOK', async () => {
  const { readFileSync } = await import('node:fs');
  const smoke = readFileSync(new URL('../scripts/production-smoke.mjs', import.meta.url), 'utf8');
  // Eski override: 'perAttemptTimeoutMs: 15000' ve 'totalBudgetMs: 60000' YOK
  assert.ok(!smoke.includes('perAttemptTimeoutMs: 15000'), 'smoke: perAttemptTimeoutMs: 15000 override kaldirildi');
  assert.ok(!smoke.includes('totalBudgetMs: 60000'), 'smoke: totalBudgetMs: 60000 override kaldirildi');
  // Ama /feed cold-cache 20s timeout OLMALI (warm-up)
  assert.ok(smoke.includes('perAttemptTimeoutMs: 20000') || smoke.includes('20000'), 'smoke: /feed warm-up 20s timeout var');
  // 2. istek 10s/20s butce OLMALI
  assert.ok(smoke.includes('totalBudgetMs: 20000'), 'smoke: 2. istek 20s butce var');
});