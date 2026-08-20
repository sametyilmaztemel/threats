// test/health.test.mjs — /api/health/ready saf karar mantığı birim testleri.
// scripts/lib/health.mjs'i test eder (IO yok). Çalıştır: node --test test/health.test.mjs
// (npm run test:health)
//
// Kapsam:
//  1. DB OK + fresh ingestion                              -> 200 ok
//  2. DB OK + warning stale (age >= warningMin)           -> 200 degraded
//  3. DB down                                              -> 503 down
//  4. Source mismatch (healthy < active)                   -> 200 degraded
//  5. Invalid timestamp (NaN / null)                      -> 200 degraded (güvenli)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readEshikler, computeReadiness, parsePositiveIntMin } from '../scripts/lib/health.mjs';

const E = readEshikler({}); // defaults 480/840
const NOW = Date.parse('2026-08-19T10:00:00Z');

// 1. DB OK + fresh ingestion -> 200 ok
test('health: DB OK + fresh ingestion -> 200 ok', () => {
  const r = computeReadiness({
    dbOk: true,
    lastIngestionMs: NOW - 60 * 60_000, // 1 saat önce
    sources: { active: 18, healthy: 18 },
    now: NOW,
    eshikler: E,
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.http, 200);
  assert.equal(r.ingestionState, 'ok');
  assert.equal(r.checks.database, 'ok');
  assert.equal(r.checks.sources, '18/18');
});

// 2. DB OK + warning stale (age >= warningMin) -> 200 degraded
test('health: DB OK + warning stale -> 200 degraded', () => {
  // age = 500 dakika (warning 480, critical 840) -> warning
  const r = computeReadiness({
    dbOk: true,
    lastIngestionMs: NOW - 500 * 60_000,
    sources: { active: 18, healthy: 18 },
    now: NOW,
    eshikler: E,
  });
  assert.equal(r.status, 'degraded');
  assert.equal(r.http, 200);
  assert.equal(r.ingestionState, 'warning');
  assert.equal(r.checks.ingestion, 'warning');
});

// 2b. critical -> 200 critical (varsayılan) | 503 (INGEST_CRITICAL_AS_DOWN)
test('health: critical -> 200 critical (varsayılan)', () => {
  const r = computeReadiness({
    dbOk: true,
    lastIngestionMs: NOW - 900 * 60_000, // 15 saat
    sources: { active: 18, healthy: 18 },
    now: NOW,
    eshikler: E,
  });
  assert.equal(r.status, 'critical');
  assert.equal(r.http, 200);
  assert.equal(r.ingestionState, 'critical');
});
test('health: critical + INGEST_CRITICAL_AS_DOWN=1 -> 503', () => {
  const EC = readEshikler({ INGEST_CRITICAL_AS_DOWN: '1' });
  const r = computeReadiness({
    dbOk: true,
    lastIngestionMs: NOW - 900 * 60_000,
    sources: { active: 18, healthy: 18 },
    now: NOW,
    eshikler: EC,
  });
  assert.equal(r.status, 'critical');
  assert.equal(r.http, 503);
});

// 3. DB down -> 503 down
test('health: DB down -> 503 down', () => {
  const r = computeReadiness({
    dbOk: false,
    lastIngestionMs: null,
    sources: null,
    now: NOW,
    eshikler: E,
  });
  assert.equal(r.status, 'down');
  assert.equal(r.http, 503);
  assert.equal(r.checks.database, 'down');
});

// 4. Source mismatch (healthy < active) -> 200 degraded
test('health: source mismatch -> 200 degraded (restart yok)', () => {
  const r = computeReadiness({
    dbOk: true,
    lastIngestionMs: NOW - 60 * 60_000,
    sources: { active: 18, healthy: 16 }, // 2 hatalı
    now: NOW,
    eshikler: E,
  });
  assert.equal(r.status, 'degraded');
  assert.equal(r.http, 200);
  assert.equal(r.checks.sources, '18/16');
  assert.equal(r.ingestionState, 'ok');
});

// 5. Invalid timestamp (NaN) -> 200 degraded (güvenli)
test('health: invalid timestamp (NaN) -> 200 degraded (güvenli)', () => {
  const r = computeReadiness({
    dbOk: true,
    lastIngestionMs: Number.NaN, // Date(last).getTime() == NaN
    sources: { active: 18, healthy: 18 },
    now: NOW,
    eshikler: E,
  });
  assert.equal(r.status, 'degraded');
  assert.equal(r.http, 200);
  assert.equal(r.ingestionState, 'invalid');
  assert.equal(r.checks.ingestion, 'invalid');
});
test('health: null lastIngestionMs -> 200 degraded (güvenli)', () => {
  const r = computeReadiness({
    dbOk: true,
    lastIngestionMs: null,
    sources: { active: 18, healthy: 18 },
    now: NOW,
    eshikler: E,
  });
  assert.equal(r.status, 'degraded');
  assert.equal(r.http, 200);
  assert.equal(r.ingestionState, 'invalid');
});

// Eschik doğrulaması: warning < critical, geçersiz -> throw
test('readEshikler: warning < critical -> ok', () => {
  const e = readEshikler({ INGESTION_WARNING_MINUTES: '100', INGESTION_CRITICAL_MINUTES: '200' });
  assert.equal(e.warningMin, 100);
  assert.equal(e.criticalMin, 200);
});
test('readEshikler: warning >= critical -> throw', () => {
  assert.throws(() => readEshikler({ INGESTION_WARNING_MINUTES: '500', INGESTION_CRITICAL_MINUTES: '500' }), /warning.*critical.*ihlal/);
  assert.throws(() => readEshikler({ INGESTION_WARNING_MINUTES: '600', INGESTION_CRITICAL_MINUTES: '100' }), /warning.*critical.*ihlal/);
});
test('readEshikler: pozitif int değilse -> throw', () => {
  assert.throws(() => readEshikler({ INGESTION_WARNING_MINUTES: '0' }), /pozitif int/);
  assert.throws(() => readEshikler({ INGESTION_WARNING_MINUTES: '-1' }), /pozitif int/);
  assert.throws(() => readEshikler({ INGESTION_WARNING_MINUTES: 'abc' }), /pozitif int/);
});


// Parity: scripts/lib/health.mjs vs app/src/lib/health.mjs aynı sonucu vermeli.
// Kısa kopya (Next alias) aynı mantığı paylaşmalı; sapma = bug.
import * as scriptsHealth from '../scripts/lib/health.mjs';
import * as appHealth from '../app/src/lib/health.mjs';
// appHealth modülü .mjs uzantılı ESM; scriptsHealth ile aynı export isimleri beklenir.

const inputs = [
  { name: 'fresh', args: { dbOk: true, lastIngestionMs: Date.now() - 3_600_000, sources: { active: 18, healthy: 18 }, eshikler: scriptsHealth.readEshikler({}) } },
  { name: 'warning', args: { dbOk: true, lastIngestionMs: Date.now() - 500 * 60_000, sources: { active: 18, healthy: 18 }, eshikler: scriptsHealth.readEshikler({}) } },
  { name: 'critical', args: { dbOk: true, lastIngestionMs: Date.now() - 900 * 60_000, sources: { active: 18, healthy: 18 }, eshikler: scriptsHealth.readEshikler({}) } },
  { name: 'db_down', args: { dbOk: false, lastIngestionMs: null, sources: null, eshikler: scriptsHealth.readEshikler({}) } },
  { name: 'source_mismatch', args: { dbOk: true, lastIngestionMs: Date.now() - 60_000, sources: { active: 18, healthy: 16 }, eshikler: scriptsHealth.readEshikler({}) } },
  { name: 'invalid_timestamp', args: { dbOk: true, lastIngestionMs: Number.NaN, sources: { active: 18, healthy: 18 }, eshikler: scriptsHealth.readEshikler({}) } },
  { name: 'critical_as_down', args: { dbOk: true, lastIngestionMs: Date.now() - 900 * 60_000, sources: { active: 18, healthy: 18 }, eshikler: scriptsHealth.readEshikler({ INGEST_CRITICAL_AS_DOWN: '1' }) } },
  { name: 'invalid_threshold', args: { dbOk: true, lastIngestionMs: Date.now() - 60_000, sources: { active: 18, healthy: 18 }, eshikler: { warningMin: 999, criticalMin: 100 } } },
];

for (const tc of inputs) {
  test(`health parity: ${tc.name}`, () => {
    const a = scriptsHealth.computeReadiness(tc.args);
    const b = appHealth.computeReadiness(tc.args);
    assert.equal(a.status, b.status, `status mismatch: ${a.status} vs ${b.status}`);
    assert.equal(a.http, b.http, `http mismatch`);
    assert.equal(a.ingestionState, b.ingestionState, `ingestionState mismatch`);
    assert.deepEqual(a.checks, b.checks, `checks mismatch`);
  });
}
