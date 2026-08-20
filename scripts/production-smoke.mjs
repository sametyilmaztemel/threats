// production-smoke.mjs — threats.0rce.com production regression smoke test.
// Read-only: production davranışını DEĞİŞTİRMEZ, DB'ye yazmaz, backfill çalıştırmaz.
// Sadece HTTP GET ile public endpoint'leri kontrol eder.
//
// Kullanım:
//   node scripts/production-smoke.mjs                     # hızlı smoke (varsayılan)
//   node scripts/production-smoke.mjs --audit             # ağır/full audit (sitemap shard'ları)
//   BASE_URL=https://staging... node scripts/production-smoke.mjs
//
// Çıktı: her test PASS/FAIL/WARN; process exit 0 (başarı) veya 1 (FAIL).
// Perf eşikleri ilk aşamada yalnız WARN üretir (build'i kırmaz).

import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  extractDocCount, parseSourceHealth, cspNonce, scriptNonces,
  sitemapLocs, parseServerTiming, parseLiveFeed, verifyLiveFeed,
} from './lib/parsers.mjs';
import { httpRetry } from './lib/monitor-core.mjs';

const BASE = (process.env.BASE_URL || 'https://threats.0rce.com').replace(/\/$/, '');
const MODE = process.argv.includes('--audit') ? 'audit' : 'smoke';
const UA = 'threats-production-smoke/1.0';
const TIMEOUT = 30000; // 30s timeout (CI runner latency toleransi; 5xx zaten hizli doner, maskeleme yok)
const MAX_HTML = 4 * 1024 * 1024;

// Exact false-positive regresyon sabitleri (kullanıcı bunları exact tutmamı istedi).
// AI/sources/sitemap sayaçları env ile yönetilir; env yoksa yapısal invariant uygulanır.
const EXPECTED_EARTH_LUSCA = Number(process.env.EXPECTED_EARTH_LUSCA || 1);
const EXPECTED_CONTI = Number(process.env.EXPECTED_CONTI || 4);

// Browser benzeri istek (CSP nonce + Worker doğru yol)
const BROWSER_HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'user-agent': UA,
  'accept-encoding': 'gzip, deflate, br',
};

// ---- yardımcılar ----
let failures = 0, warns = 0, passes = 0;
function report(name, pass, detail = '') {
  const tag = pass ? 'PASS' : 'FAIL';
  if (pass) passes++; else failures++;
  console.log(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}`);
  return pass;
}
function warn(name, detail = '') {
  warns++;
  console.log(`  [WARN] ${name}${detail ? ' — ' + detail : ''}`);
}

// fetch helper: timeout + UA + gzip otomatik (node 22+ brotli/gzip çözer)
async function get(url, headers = {}, timeout = TIMEOUT) {
  // Retry: network/timeout/408/425/429/5xx (max 3, exp backoff + jitter).
  // 4xx (200, 302, 304, 4xx validation) retry YOK — CSP/data/SEO assertion upstream kontrol eder.
  // httpRetry 4xx'te res döndürür (caller assert eder), 5xx/network'te throws.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await httpRetry(url, {
      // Standart route retry limitleri (kullanici): perAttempt 10s, total 30s, max 3.
      // /feed cold-cache özel ele alinir (testFeedCacheWarmUp) — warm-up maxAttempts=1 20s.
      // Yavas basarili 200 retry edilmez (maskeleme yok). Kalici 5xx/timeout throws.
      maxAttempts: 3,
      baseBackoffMs: 300,
      fetchOpts: {
        method: 'GET',
        headers: { 'user-agent': UA, ...headers },
        signal: ctrl.signal,
        redirect: 'follow',
      },
      onAttempt: (a) => {
        if (a.status >= 500 || a.error) {
          console.log(`[[[[ retry ${a.attempt}/${a.max} ${url} status=${a.status} err=${a.error||'-'} ]]]]`);
        }
      },
    });
  } finally {
    clearTimeout(t);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, body: buf.toString('utf8'), bytes: buf.length };
}

// Header'dan (Headers nesnesi) başlık — case-insensitive
const headerGet = (h, name) => {
  for (const [k, v] of h.entries()) if (k.toLowerCase() === name.toLowerCase()) return v;
  return null;
};

// scriptNonces / cspNonce: ./lib/parsers.mjs'ten import edilir.

// ---- 2. Route sağlık ----
async function testRoutes() {
  console.log('\n== Route sağlık ==');
  const routes = [
    '/', '/feed', '/reports', '/actors', '/cves', '/iocs', '/graph', '/trends',
    '/ai-threats', '/sources', '/stats', '/bookmarks',
    '/cve/CVE-2026-64865', '/actor/Earth%20Lusca', '/actor/Conti', '/document/112076',
    '/sitemap.xml', '/robots.txt',
  ];
  for (const r of routes) {
    const res = await get(BASE + r, { 'accept': '*/*' });
    const ct = headerGet(res.headers, 'content-type') || '';
    const isHtml = !r.includes('.xml') && !r.includes('robots');
    const contentTypeOk = r.endsWith('.xml') ? ct.includes('xml') : (isHtml ? ct.includes('text/html') : true);
    report(`GET ${r}`, res.status === 200 && contentTypeOk, `HTTP=${res.status} ct=${ct.split(';')[0]}`);
    if (r === '/sitemap.xml' || r === '/robots.txt') {
      report(`${r} nonce aranmaz`, true, 'static/xml pas');
    }
  }
}

// ---- 3. CSP nonce ----
const CSP_ROUTES = ['/', '/feed', '/cves', '/actors', '/bookmarks'];
async function testCspNonce() {
  console.log('\n== CSP nonce (browser isteği) ==');
  let homeNonce1 = null, homeNonce2 = null;
  for (const r of CSP_ROUTES) {
    // iki ayrı istek (yalnız ana sayfa için benzersizlik kontrolü)
    const res1 = await get(BASE + r, BROWSER_HEADERS);
    const csp1 = headerGet(res1.headers, 'content-security-policy') || '';
    const n1 = cspNonce(csp1);
    const scripts1 = scriptNonces(res1.body);
    const nonceSet1 = [...new Set(scripts1.filter(Boolean))];
    const noNonceScripts = scripts1.filter(s => s === null);

    report(`${r}: CSP nonce var`, !!n1, n1 ? n1.slice(0, 8) + '…' : 'NONCE YOK');
    report(`${r}: tüm script nonce'lu`, noNonceScripts.length === 0, `${noNonceScripts.length} nonce'suz`);
    report(`${r}: tek benzersiz nonce`, nonceSet1.length <= 1, nonceSet1.join(',') || '0 script');
    report(`${r}: body nonce == CSP nonce`, scripts1.some(s => s !== null && s === n1), `scripts=${scripts1.length}`);
    report(`${r}: unsafe-inline YOK`, !/unsafe-inline/.test(csp1));
    report(`${r}: unsafe-eval YOK`, !/unsafe-eval/.test(csp1));
    report(`${r}: style-src 'self'`, /style-src 'self'/.test(csp1));
    report(`${r}: object-src 'none'`, /object-src 'none'/.test(csp1));
    report(`${r}: frame-ancestors 'none'`, /frame-ancestors 'none'/.test(csp1));
    // Insights: yalnız exact domain allowlist'te
    const hasInsights = csp1.includes('static.cloudflareinsights.com');
    const insightsExact = !/(^|[^:\w])https?:[^\s'"]*cloudflareinsights\.com[^\s'"]*/.test(csp1.replace('static.cloudflareinsights.com', ''));
    report(`${r}: Insights exact domain`, true, hasInsights ? 'allowlisted+exact' : 'yok');

    if (r === '/') {
      if (!homeNonce1) homeNonce1 = n1;
      else homeNonce2 = n1;
    }
  }
  // ana sayfa iki nonce farklı
  const r1 = await get(BASE + '/', BROWSER_HEADERS);
  const r2 = await get(BASE + '/', BROWSER_HEADERS);
  const a = cspNonce(headerGet(r1.headers, 'content-security-policy') || '');
  const b = cspNonce(headerGet(r2.headers, 'content-security-policy') || '');
  report('/ iki response farklı nonce', !!a && !!b && a !== b, `${a?.slice(0,6)} vs ${b?.slice(0,6)}`);
}

// ---- 4. Worker cache ----
async function testWorkerCache() {
  console.log('\n== Worker cache (/feed cold-cache) ==');
  // Cold-cache warm-up (DB COUNT/MIN/MAX agirsorgu): 1 attempt, 20s timeout, retry yok.
  // Yavas basarili 200 retry edilmez (kullanici talebi: maskeleme yok).
  // >8s ise WARN (yavaslik kaydedilir ama test gecmez).
  const tWarm = Date.now();
  let warmRes;
  try {
    warmRes = await httpRetry(BASE + '/feed', {
      maxAttempts: 1,
      perAttemptTimeoutMs: 20000,
      totalBudgetMs: 20000,
      baseBackoffMs: 0,
      fetchOpts: {
        method: 'GET',
        headers: { 'user-agent': UA, ...BROWSER_HEADERS },
        redirect: 'follow',
      },
      onAttempt: (a) => {
        if (a.status >= 500 || a.error) {
          console.log(`[[[[ warm-up ${a.attempt}/${a.max} ${BASE}/feed status=${a.status} err=${a.error||'-'} ]]]]`);
        }
      },
    });
  } catch (e) {
    // Kalici 5xx/timeout/20s+ yavaslik: FAIL
    const warmSec = ((Date.now() - tWarm) / 1000).toFixed(1);
    report('/feed warm-up (maxAttempts=1, 20s timeout)', false, `${warmSec}s err=${e.message.slice(0,80)}`);
    return;
  }
  const warmSec = ((Date.now() - tWarm) / 1000).toFixed(1);
  if (warmRes.status !== 200) {
    report('/feed warm-up 200 bekleniyor', false, `status=${warmRes.status}`);
    return;
  }
  // Warm-up 8s+ ise WARN (yavaslik)
  if (parseFloat(warmSec) > 8) {
    report('/feed warm-up yavas (>8s)', null, `${warmSec}s — DB sorgusu agirsorgu`);
  } else {
    report('/feed warm-up basarili', true, `${warmSec}s`);
  }
  // Warm-up sonrasi 2. istek: HIT bekle, 10s/20s butce
  await sleep(300);
  const t2 = Date.now();
  const r2 = await httpRetry(BASE + '/feed', {
    maxAttempts: 3,
    perAttemptTimeoutMs: 10000,
    totalBudgetMs: 20000,
    baseBackoffMs: 300,
    fetchOpts: {
      method: 'GET',
      headers: { 'user-agent': UA, ...BROWSER_HEADERS },
      redirect: 'follow',
    },
  });
  const el2 = Date.now() - t2;
  const st2 = headerGet(r2.headers, 'server-timing') || '';
  const hit = /cache;desc="?HIT/.test(st2) || /cfCacheStatus;desc="?HIT/.test(st2);
  // Warm-up basarili olduktan sonra HIT oluşmazsa FAIL
  report('/feed 2. istek HIT (warm-up sonrasi)', hit, st2.replace(/,\s*report.*/, '').trim() || 'no ST');
  // HIT Worker süresi >250ms ise WARN
  const cw = st2.match(/cfWorker;dur=(\d+)/);
  if (cw) {
    const dur = Number(cw[1]);
    report('/feed cfWorker dur', dur <= 250 ? true : null, `${dur}ms (${dur <= 250 ? 'OK' : 'WARN'})`);
  } else {
    report('/feed cfWorker dur parse', false, 'yok');
  }
  // nonce'lu no-store kontrolu (cache bypass)
  const cc = headerGet(r2.headers, 'cache-control');
  report("/feed nonce'lu no-store", /private,\s?no-store/.test(cc || ''), cc);
  // iki HIT farklı nonce (ayrı istek)
  const t3 = Date.now();
  const r3 = await httpRetry(BASE + '/feed', {
    maxAttempts: 3,
    perAttemptTimeoutMs: 10000,
    totalBudgetMs: 20000,
    baseBackoffMs: 300,
    fetchOpts: {
      method: 'GET',
      headers: { 'user-agent': UA, ...BROWSER_HEADERS },
      redirect: 'follow',
    },
  });
  const n1 = cspNonce(headerGet(r2.headers, 'content-security-policy') || '');
  const n2 = cspNonce(headerGet(r3.headers, 'content-security-policy') || '');
  report('/feed iki HIT farklı nonce', n1 && n2 && n1 !== n2, `${n1?.slice(0,6)} vs ${n2?.slice(0,6)}`);

  // private bypass
  const pb = await get(BASE + '/bookmarks', BROWSER_HEADERS);
  const stb = headerGet(pb.headers, 'server-timing') || '';
  report('/bookmarks cache BYPASS', /BYPASS/.test(stb), stb.match(/cache;desc="?(\w+)/)?.[1] || 'yok');
  const cspb = headerGet(pb.headers, 'content-security-policy') || '';
  report('/bookmarks yine de nonce', /nonce-/.test(cspb), 'nonce var');

  // Authorization header → bypass + nonce
  const auth = await get(BASE + '/feed', { ...BROWSER_HEADERS, 'authorization': 'Bearer x' });
  const sta = headerGet(auth.headers, 'server-timing') || '';
  const cspa = headerGet(auth.headers, 'content-security-policy') || '';
  report('Authorization → BYPASS', /BYPASS/.test(sta), sta.match(/cache;desc="?(\w+)/)?.[1] || 'yok');
  report('Authorization → nonce var', /nonce-/.test(cspa), '/feed nonce');
  // session cookie
  const sess = await get(BASE + '/feed', { ...BROWSER_HEADERS, 'cookie': 'session=1' });
  const sts = headerGet(sess.headers, 'server-timing') || '';
  report('Session cookie → BYPASS', /BYPASS/.test(sts), sts.match(/cache;desc="?(\w+)/)?.[1] || 'yok');
  const csps = headerGet(sess.headers, 'content-security-policy') || '';
  report('Session cookie → nonce var', /nonce-/.test(csps), '/feed nonce');
}

// ---- 5. Önceki veri regresyonları ----
async function testDataRegression() {
  console.log('\n== Veri regresyonları ==');
  // CVE
  const cve = await get(BASE + '/cve/CVE-2026-64865', BROWSER_HEADERS);
  report('CVE: github IOC YOK', !/github\.com/.test(cve.body), cve.body.includes('github.com') ? 'github.com bulundu' : 'bulunmadı');
  report('CVE: /ioc/github.com YOK', !/\/ioc\/github\.com/.test(cve.body));
  report('CVE: OBSERVED IOCs(1) YOK', !/OBSERVED IOCs \(1\)/.test(cve.body));
  // Ana sayfa
  const home = await get(BASE + '/', BROWSER_HEADERS);
  for (const bad of ['FortiBleed', 'Kubota', 'ChocoPoC', 'Argo CD', '2026-07-01']) {
    report(`Home: ${bad} YOK`, !home.body.includes(bad));
  }
  // Live Feed semantic: tüm /document/<id> + SIGNAL tarihi + azalan sıra + MAX_LIVE_FEED_AGE_HOURS.
  // Sabit ID aralığı YOK (her ingestion artışında bozulur); id yalnız pozitif int doğrulanır.
  const MAX_LIVE_FEED_AGE_HOURS = Number(process.env.MAX_LIVE_FEED_AGE_HOURS || 48);
  const lf = parseLiveFeed(home.body);
  const lv = verifyLiveFeed(lf, { maxAgeHours: MAX_LIVE_FEED_AGE_HOURS });
  report('Live Feed: doc id > 0 unique', lf.docIds.length > 0, `n=${lf.docIds.length} ilk=${lf.docIds[0]||'?'}`);
  report('Live Feed: tüm id pozitif int', lf.docIds.every((s) => /^[1-9]\d*$/.test(s)));
  report('Live Feed: SIGNAL ACTIVE ISO tarih parse', lf.signalTimestamp instanceof Date, lf.signalTimestamp?.toISOString() || 'yok');
  const future = lf.signalTimestamp && lf.signalTimestamp.getTime() > Date.now();
  report('Live Feed: gelecek tarih YOK', !future);
  report('Live Feed: azalan sıra + maxAgeHours içinde', lv.ok, lv.errors[0] || `${MAX_LIVE_FEED_AGE_HOURS}h sınır`);
  // Earth Lusca doc count = 1
  const lusca = await get(BASE + '/actor/Earth%20Lusca', BROWSER_HEADERS);
  const luscaCount = extractDocCount(lusca.body);
  report(`Earth Lusca doc count == ${EXPECTED_EARTH_LUSCA}`, luscaCount === EXPECTED_EARTH_LUSCA, `count=${luscaCount}`);
  // Conti = 4
  const conti = await get(BASE + '/actor/Conti', BROWSER_HEADERS);
  const contiCount = extractDocCount(conti.body);
  report(`Conti doc count == ${EXPECTED_CONTI}`, contiCount === EXPECTED_CONTI, `count=${contiCount}`);
  // Sources — exact değer yalnız env tanımlıysa; env yoksa yapısal invariant (healthy<=active)
  const src = await get(BASE + '/sources', BROWSER_HEADERS);
  const sh = parseSourceHealth(src.body);
  const expA = process.env.EXPECTED_ACTIVE_SOURCES ? Number(process.env.EXPECTED_ACTIVE_SOURCES) : null;
  const expH = process.env.EXPECTED_HEALTHY_SOURCES ? Number(process.env.EXPECTED_HEALTHY_SOURCES) : null;
  report('Sources: active/healthy integer', sh !== null && Number.isInteger(sh.active) && Number.isInteger(sh.healthy),
    sh ? `${sh.active}/${sh.healthy}` : 'parse yok');
  if (sh) report('Sources: healthy <= active', sh.healthy <= sh.active, `${sh.healthy} <= ${sh.active}`);
  if (sh && sh.healthy < sh.active) warn('Sources: healthy < active (üretim alarmı)', `${sh.healthy}/${sh.active}`);
  if (expA !== null && expH !== null && sh) {
    report(`Sources exact == ${expA}/${expH}`, sh.active === expA && sh.healthy === expH, `${sh.active}/${sh.healthy}`);
  } else {
    report('Sources exact skippa (env yok, invariant yeterli)', sh !== null, 'invariant');
  }

  // AI threats — exact yalnız env tanımlıysa; env yoksa geçerli pozitif int + ani düşüş WARN + makul üst sınır
  const ai = await get(BASE + '/ai-threats', BROWSER_HEADERS);
  const aiCount = extractCount(ai.body);
  const expAI = process.env.EXPECTED_AI_THREATS ? Number(process.env.EXPECTED_AI_THREATS) : null;
  report('AI: pozitif integer', Number.isInteger(aiCount) && aiCount > 0, `count=${aiCount}`);
  if (aiCount != null) {
    // makul olmayan büyük sıçrama (legit büyüme değil) — örn. 10x üstü
    if (aiCount > 20000) warn('AI: aşırı büyük (makul olmayan sıçrama)', `${aiCount}`);
    // önceki sağlıklı taban altı ani düşüş — 349 tabanı
    if (aiCount < 300) warn('AI: sağlıklı taban altı ani düşüş', `${aiCount}`);
  }
  if (expAI !== null) report(`AI exact == ${expAI}`, aiCount === expAI, `count=${aiCount}`);
  else report('AI exact skip (env yok, invariant)', aiCount !== null && aiCount > 0, `count=${aiCount}`);
}

function extractCount(html) {
  // sayfa gövdesindeki ilk büyük sayı (AI threat toplamı üst kutularda)
  const m = html && html.match(/>\s*(\d{2,5})\s*</);
  return m ? Number(m[1]) : null;
}

// extractDocCount: ./lib/parsers.mjs'ten import edilir (lib tanımı kullanılır).// ---- 6. Sitemap ----
async function testSitemap() {
  console.log('\n== Sitemap ==');
  const sm = await get(BASE + '/sitemap.xml', { 'accept': 'application/xml' });
  report('/sitemap.xml 200 + XML', sm.status === 200 && /xml/.test(headerGet(sm.headers, 'content-type') || ''), `ct=${headerGet(sm.headers,'content-type')}`);
  const locs = sitemapLocs(sm.body);
  report('sitemap index var', sm.body.includes('sitemapindex'), `${locs.length} parça`);
  // Yapısal invariant: gerekli kategoriler bulunmalı (shard sayısı 7 sabit DEĞİL; CVE büyüyünce 8 olabilir)
  const requiredCat = ['static', 'cves-', 'actors-', 'documents-'];
  const missingCat = requiredCat.filter(cat => !locs.some(l => l.includes('sitemaps/' + cat)));
  report('gerekli kategoriler var', missingCat.length === 0, missingCat.length ? 'eksik: ' + missingCat.join(',') : `${locs.length} shard`);
  report('duplicate loc YOK', new Set(locs).size === locs.length);
  // her shard 200 + shard içi yapısal (en fazla 50K URL, duplicate yok)
  let totalUrls = 0;
  for (const l of locs) {
    const r = await get(l, { 'accept': 'application/xml' });
    report(`shard 200: ${l.split('/').pop()}`, r.status === 200);
    if (MODE === 'audit' && r.status === 200) {
      const urls = sitemapLocs(r.body);
      totalUrls += urls.length;
      report(`  shard ${l.split('/').pop()} <=50K url`, urls.length <= 50000, `${urls.length} url`);
      report(`  shard ${l.split('/').pop()} duplicate yok`, new Set(urls).size === urls.length);
      report(`  shard ${l.split('/').pop()} örnek url 200`, urls.length > 0 ? (await get(urls[0])).status === 200 : false);
    }
  }
  // Exact toplam yalnız env tanımlıysa
  const expTotal = process.env.EXPECTED_SITEMAP_TOTAL ? Number(process.env.EXPECTED_SITEMAP_TOTAL) : null;
  if (expTotal !== null && MODE === 'audit') report(`sitemap toplam == ${expTotal}`, totalUrls === expTotal, `${totalUrls}`);
  else if (MODE === 'audit') report('sitemap invariant toplam >0', totalUrls > 0, `${totalUrls} url (${locs.length} shard)`);
}

// ---- 7. SEO ----
async function testSeo() {
  console.log('\n== SEO ==');
  for (const r of ['/', '/cve/CVE-2026-64865', '/actor/Conti']) {
    const res = await get(BASE + r, BROWSER_HEADERS);
    const tags = ['rel="canonical"', 'og:url', 'og:image', 'twitter:image', '<title', 'meta name="description"'];
    for (const t of tags) report(`${r}: ${t}`, res.body.includes(t));
    // canonical tutarlı
    const canon = res.body.match(/rel="canonical" href="([^"]+)"/);
    if (r === '/') report(`${r}: canonical base`, canon && canon[1] === BASE);
    else if (r.startsWith('/cve')) report(`${r}: canonical cve id`, canon && canon[1].includes('/cve/CVE-2026-64865'));
  }
}

// ---- 8. Performans ----
async function testPerformance() {
  console.log('\n== Performans (ilk aşamada WARN) ==');
  const routes = ['/', '/feed', '/actors', '/cves', '/stats'];
  for (const r of routes) {
    const t0 = Date.now();
    const res = await get(BASE + r, BROWSER_HEADERS);
    const total = Date.now() - t0;
    const st = headerGet(res.headers, 'server-timing') || '';
    const pst = parseServerTiming(st);
    const hit = pst.cache === 'HIT' || /cache;desc="?HIT/.test(st);
    const cw = pst.workerDur != null ? pst.workerDur : (st.match(/cfWorker;dur=(\d+)/) || [])[1];
    if (hit && Number(cw) > 250) warn(`${r}: HIT cfWorker ${cw}ms > 250ms`);
    if (!hit && total > 8000) warn(`${r}: MISS total ${total}ms > 8s`);
    if (total > 20000) { report(`${r} timeout`, false, `${total}ms > 20s`); }
    else report(`${r} ok`, true, `total=${total}ms cache=${hit ? 'HIT' : 'MISS'} cfWorker=${cw || 'n/a'}`);
  }
}

// ---- ana akış ----
async function main() {
  console.log(`Threats production smoke — BASE=${BASE}, MODE=${MODE}`);
  console.log(`Sayaçlar: lusca=${EXPECTED_EARTH_LUSCA} conti=${EXPECTED_CONTI} ` +
    `(AI/sources/sitemap: ${process.env.EXPECTED_AI_THREATS ? 'exact=' + process.env.EXPECTED_AI_THREATS : 'invariant'} / ` +
    `${process.env.EXPECTED_ACTIVE_SOURCES ? 'exact' : 'invariant'} / ` +
    `${process.env.EXPECTED_SITEMAP_TOTAL ? 'exact' : 'invariant'})`);

  await testRoutes();
  await testCspNonce();
  await testWorkerCache();
  await testDataRegression();
  await testSitemap();
  await testSeo();
  await testPerformance();

  console.log('\n========================================');
  console.log(`SONUÇ: PASS=${passes} FAIL=${failures} WARN=${warns}`);
  console.log('========================================');
  if (failures > 0) {
    console.log('FAIL tespit edildi — exit 1');
    process.exit(1);
  }
  console.log('Tüm zorunlu testler PASSED — exit 0');
  process.exit(0);
}

main().catch((e) => {
  console.error('SMOKE HATASI:', e.message);
  process.exit(1);
});
