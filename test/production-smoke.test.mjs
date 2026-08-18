// test/production-smoke.test.mjs — lib/parsers.mjs için fixture tabanlı birim testleri.
// Amaç: production HTML değişikliği parser'ı SESSİZCE yanlış sonuçlandırmamalı.
// Parser veri bulamazsa null/[] döner — PASS üretmez, ancak test bunu FAIL sayar.
// Çalıştır: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  headerGet, extractDocCount, parseSourceHealth, cspNonce, scriptNonces,
  sitemapLocs, seoMeta, parseServerTiming,
} from '../scripts/lib/parsers.mjs';

// ---------- extractDocCount ----------
test('extractDocCount: React bölmeli fixtliste unique doc link sayısı', () => {
  const html = 'doc1: /document/112076 <!-- --> doc2: /document/112076 ' +
    '/document/112077 /document/112078';
  assert.equal(extractDocCount(html), 3); // unique 112076,112077,112078
});

test('extractDocCount: tekrar eden document linkleri tek sayılır', () => {
  const html = '/document/5 /document/5 /document/5 /document/9';
  assert.equal(extractDocCount(html), 2);
});

test('extractDocCount: DOCUMENTS blok etiketi fallback', () => {
  const html = '<div>DOCUMENTS</div><div>4</div>';
  assert.equal(extractDocCount(html), 4);
});

test('extractDocCount: empty/null -> null (PASS değil)', () => {
  assert.equal(extractDocCount(''), null);
  assert.equal(extractDocCount(null), null);
});

test('extractDocCount: malformed HTML (doku yok) -> null', () => {
  assert.equal(extractDocCount('<div>welp</div><!doctype html>'), null);
});

// ---------- parseSourceHealth ----------
test('parseSourceHealth: React <!-- --> parçalı footer', () => {
  const html = '77<!-- --> configured · <!-- -->18<!-- --> active · <!-- -->18<!-- --> healthy· <!-- --> 59 disabled';
  assert.deepEqual(parseSourceHealth(html), { active: 18, healthy: 18 });
});

test('parseSourceHealth: unicode nbsp/· varyantları', () => {
  const html = '18\u00a0active\u00b718\u00a0healthy';
  assert.deepEqual(parseSourceHealth(html), { active: 18, healthy: 18 });
});

test('parseSourceHealth: healthy > active -> yine de parse edilir (üst katman karar verir)', () => {
  assert.deepEqual(parseSourceHealth('10 active 12 healthy'), { active: 10, healthy: 12 });
});

test('parseSourceHealth: empty -> null', () => {
  assert.equal(parseSourceHealth(''), null);
  assert.equal(parseSourceHealth(null), null);
});

// ---------- cspNonce ----------
test('cspNonce: script-src nonce çıkarır', () => {
  const csp = "default-src 'self'; script-src 'self' 'nonce-abc123DEF456'; style-src 'self'";
  assert.equal(cspNonce(csp), 'abc123DEF456');
});

test('cspNonce: eksik CSP -> null (PASS değil)', () => {
  assert.equal(cspNonce(null), null);
  assert.equal(cspNonce(''), null);
  assert.equal(cspNonce("script-src 'self' 'unsafe-inline'"), null); // nonce yok
});

// ---------- scriptNonces ----------
test('scriptNonces: tüm script nonce taşıyor', () => {
  const html = '<script nonce="a123">x()</script><script nonce="b456" src="/s.js"></script>';
  assert.deepEqual(scriptNonces(html), ['a123', 'b456']);
});

test("scriptNonces: bir script nonce'suz kalırsa null eleman (FAIL sinyali)", () => {
  const html = '<script nonce="a123">x()</script><script>y()</script>';
  assert.deepEqual(scriptNonces(html), ['a123', null]);
});

test('scriptNonces: empty -> []', () => {
  assert.deepEqual(scriptNonces(''), []);
  assert.deepEqual(scriptNonces(null), []);
});

test('scriptNonces: malformed (tag kapanmamış) -> yine de içerdekliler', () => {
  const html = '<script nonce="a1">x()<script nonce="b2">y()';
  assert.deepEqual(scriptNonces(html), ['a1', 'b2']);
});

// ---------- nonce uyuşmazlığı (fixture-level senaryo) ----------
test("nonce uyuşmazlığı: body nonce CSP nonce\'la eşleşmezse tespit edilir", () => {
  const body = '<script nonce="XXXXXXXX"></script>';
  const csp = "script-src 'self' 'nonce-YYYYYYYY'";
  const bodyNonces = scriptNonces(body); // ['XXXXXXXX']
  const cspN = cspNonce(csp);             // YYYYYYYY
  const matched = bodyNonces.some(s => s !== null && s === cspN);
  assert.equal(matched, false);
});

// ---------- sitemapLocs ----------
test("sitemapLocs: index loc'larını çıkarır", () => {
  const xml = '<sitemapindex><sitemap><loc>https://x/a</loc></sitemap><sitemap><loc>https://x/b</loc></sitemap></sitemapindex>';
  assert.deepEqual(sitemapLocs(xml), ['https://x/a', 'https://x/b']);
});

test('sitemapLocs: empty -> []', () => {
  assert.deepEqual(sitemapLocs(''), []);
  assert.deepEqual(sitemapLocs(null), []);
});

// ---------- seoMeta ----------
test('seoMeta: canonical/og attribute sırası değişikliğine tolerans', () => {
  // canonical rel href önce; og:url content sonra (sıra değişti)
  const html = '<link rel="canonical" href="https://x/foo"/><meta content="https://x/foo" property="og:url"/>';
  const m = seoMeta(html);
  assert.equal(m.canonical, 'https://x/foo');
  assert.equal(m.ogUrl, 'https://x/foo');
  assert.equal(m.hasAll, false); // og:image vs eksik
});

test('seoMeta: tüm etiketler mevcut (tam HTML)', () => {
  const html = '<link rel="canonical" href="https://x/"/><meta property="og:url" content="https://x/"/>' +
    '<meta property="og:image" content="https://x/og.png"/><meta name="twitter:image" content="https://x/og.png"/>' +
    '<title>T</title><meta name="description" content="d"/>';
  const m = seoMeta(html);
  assert.equal(m.hasAll, true);
  assert.equal(m.canonical, 'https://x/');
});

test('seoMeta: empty -> hasAll false, canonical null', () => {
  const m = seoMeta('');
  assert.equal(m.hasAll, false);
  assert.equal(m.canonical, null);
});

// ---------- parseServerTiming ----------
test('parseServerTiming: birden fazla Server-Timing değeri', () => {
  const st = 'cfWorker;dur=4, cache;desc="HIT", cfCacheStatus;desc="HIT"';
  const p = parseServerTiming(st);
  assert.equal(p.workerDur, 4);
  assert.equal(p.cache, 'HIT');
  assert.equal(p.desc, 'HIT');
});

test('parseServerTiming: boş -> değerler null', () => {
  const p = parseServerTiming('');
  assert.equal(p.workerDur, null);
  assert.equal(p.cache, null);
  assert.equal(p.desc, null);
});

// ---------- headerGet (raw string) ----------
test('headerGet: case-insensitive', () => {
  const raw = 'HTTP/2 200\r\nServer-Timing: x;dur=1\r\nContent-Type: text/html\r\n';
  assert.equal(headerGet(raw, 'content-type'), 'text/html');
  assert.equal(headerGet(raw, 'server-timing'), 'x;dur=1');
});
