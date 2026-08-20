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

// 21. Retry-After: HTTP-date (gelecek)
test('retry-after: HTTP-date (gelecek ~1s)', async () => {
  // future = Date.now()+1000 (test setup aninda). httpRetry aninda Date.now() ~setup+50-200ms.
  // delta ~800-950ms. MAX_RETRY_AFTER cap uygulanmaz (delta < 5000).
  // elapsed >= 700.
  const future = new Date(Date.now() + 1000).toUTCString();
  const f = mockFetchWithHeaders([{ status: 429, headers: new Map([['retry-after', future]]) }, { status: 200 }]);
  globalThis.fetch = f;
  const t0 = Date.now();
  const res = await httpRetry('http://x/', { fetchImpl: f, totalBudgetMs: 30000, perAttemptTimeoutMs: 10000, baseBackoffMs: 5 });
  const elapsed = Date.now() - t0;
  assert.equal(res.status, 200);
  // delta ~500-1000ms (test setup degisken). elapsed >= 400.
  assert.ok(elapsed >= 400, `Retry-After 1s bekleniyor, elapsed=${elapsed}ms`);
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