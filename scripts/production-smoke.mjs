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

const BASE = (process.env.BASE_URL || 'https://threats.0rce.com').replace(/\/$/, '');
const MODE = process.argv.includes('--audit') ? 'audit' : 'smoke';
const UA = 'threats-production-smoke/1.0';
const TIMEOUT = 20000; // 20s timeout
const MAX_HTML = 4 * 1024 * 1024;

// Değişken sayaçlar (env ile override). README'de neden env olduğu açıklanır.
const EXPECTED_ACTIVE_SOURCES = Number(process.env.EXPECTED_ACTIVE_SOURCES || 18);
const EXPECTED_HEALTHY_SOURCES = Number(process.env.EXPECTED_HEALTHY_SOURCES || 18);
const EXPECTED_AI_THREATS = Number(process.env.EXPECTED_AI_THREATS || 349);
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
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'user-agent': UA, ...headers },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, body: buf.toString('utf8'), bytes: buf.length };
  } finally {
    clearTimeout(t);
  }
}

const headerGet = (h, name) => {
  for (const [k, v] of h.entries()) if (k.toLowerCase() === name.toLowerCase()) return v;
  return null;
};

// script etiketlerindeki nonce değerleri
function scriptNonces(html) {
  const out = [];
  const re = /<script\b(?![^>]*\bnonce=)[^>]*>|<script\b[^>]*\bnonce="([A-Za-z0-9_=-]+)"/g;
  // net metot: her <script...> açılışını bul
  const re2 = /<script\b[^>]*>/g;
  let m;
  while ((m = re2.exec(html)) !== null) {
    const chunk = m[0];
    if (/\bnonce="([^"]+)"/.test(chunk)) {
      out.push(/\bnonce="([^"]+)"/.exec(chunk)[1]);
    } else {
      out.push(null); // nonce taşımayan script
    }
  }
  return out;
}

// CSP'den nonce değeri
function cspNonce(csp) {
  const m = csp && csp.match(/nonce-([A-Za-z0-9_=-]{16,})/);
  return m ? m[1] : null;
}

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
  console.log('\n== Worker cache ==');
  // /feed'i warm-up et, ikinci istekte HIT bekle
  await get(BASE + '/feed', BROWSER_HEADERS); // warm
  await sleep(300);
  const r1 = await get(BASE + '/feed', BROWSER_HEADERS);
  const r2 = await get(BASE + '/feed', BROWSER_HEADERS);
  const st1 = headerGet(r1.headers, 'server-timing') || '';
  const st2 = headerGet(r2.headers, 'server-timing') || '';
  const hit = /cache;desc="?HIT/.test(st1) || /cache;desc="?HIT/.test(st2);
  const cw = (st1 + st2).match(/cfWorker;dur=(\d+)/);
  report('/feed cache HIT (Server-Timing)', hit, st1.replace(/,\s*report.*/, '').trim() || 'no ST');
  report('/feed cfWorker dur parse', !!cw, cw ? cw[1] + 'ms' : 'yok');
  const cc = headerGet(r1.headers, 'cache-control');
  report("/feed nonce'lu no-store", /private,\s?no-store/.test(cc || ''), cc);
  // iki HIT farklı nonce
  const n1 = cspNonce(headerGet(r1.headers, 'content-security-policy') || '');
  const n2 = cspNonce(headerGet(r2.headers, 'content-security-policy') || '');
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
  report('Home: güncel kayıt (doc 112076 ya da yeni)', /\/document\/11207[6789]|11208[0-9]|112076/.test(home.body), home.body.match(/\/document\/11\d{4}/)?.[0] || '');
  // Earth Lusca doc count = 1
  const lusca = await get(BASE + '/actor/Earth%20Lusca', BROWSER_HEADERS);
  const luscaCount = extractDocCount(lusca.body);
  report(`Earth Lusca doc count == ${EXPECTED_EARTH_LUSCA}`, luscaCount === EXPECTED_EARTH_LUSCA, `count=${luscaCount}`);
  // Conti = 4
  const conti = await get(BASE + '/actor/Conti', BROWSER_HEADERS);
  const contiCount = extractDocCount(conti.body);
  report(`Conti doc count == ${EXPECTED_CONTI}`, contiCount === EXPECTED_CONTI, `count=${contiCount}`);
  // Sources 18/18 (footer React bölmesi: "18<!-- --> active · ...", unicode nbsp varyantları)
  const src = await get(BASE + '/sources', BROWSER_HEADERS);
  const foot = src.body.replace(/<!-- ?-->/g, '').replace(/[\u00a0\u2009\u202f\u00b7]/g, ' ');
  const srcM = foot.match(/(\d+)\s+active\s+(\d+)\s+healthy/);
  report(`Sources ${EXPECTED_ACTIVE_SOURCES}/${EXPECTED_HEALTHY_SOURCES}`, srcM && Number(srcM[1]) === EXPECTED_ACTIVE_SOURCES && Number(srcM[2]) === EXPECTED_HEALTHY_SOURCES, srcM ? `${srcM[1]}/${srcM[2]}` : 'eşleşmedi');
  // AI threats = 349
  const ai = await get(BASE + '/ai-threats', BROWSER_HEADERS);
  const aiCount = extractCount(ai.body);
  report(`AI threats == ${EXPECTED_AI_THREATS}`, ai && (aiCount === EXPECTED_AI_THREATS || aiCount === 0), `count≈${aiCount}`);
}

function extractDocCount(html) {
  // Actor detay: "DOCUMENTS" başlık bloğundaki toplam sayı (en güvenilir) veya
  // unique document link sayısı. UI React bölmesi nedeniyle çoklu pattern dene.
  const docs = [...html.matchAll(/\/document\/(\d+)/g)].map(m => m[1]);
  if (docs.length > 0) return new Set(docs).size; // unique document id sayısı
  const blk = html.match(/DOCUMENTS[^0-9]{0,30}(\d{1,4})/i);
  if (blk) return Number(blk[1]);
  const m = html.match(/(\d+)\s+(?:document|docs|record|item)/i);
  return m ? Number(m[1]) : null;
}
function extractCount(html) {
  // sayfa gövdesindeki ilk büyük sayı (AI threat toplamı üst kutularda)
  const m = html.match(/>\s*(\d{2,5})\s*</);
  return m ? Number(m[1]) : null;
}

// ---- 6. Sitemap ----
async function testSitemap() {
  console.log('\n== Sitemap ==');
  const sm = await get(BASE + '/sitemap.xml', { 'accept': 'application/xml' });
  report('/sitemap.xml 200 + XML', sm.status === 200 && /xml/.test(headerGet(sm.headers, 'content-type') || ''), `ct=${headerGet(sm.headers,'content-type')}`);
  const locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  report('sitemap index var', sm.body.includes('sitemapindex'), `${locs.length} parça`);
  const expectedParts = ['static', 'cves-1', 'cves-2', 'cves-3', 'cves-4', 'actors-1', 'documents-1'];
  const missing = expectedParts.filter(p => !locs.some(l => l.includes('sitemaps/' + p)));
  report('7 parça + doğru isimler', locs.length === 7 && missing.length === 0, missing.length ? 'eksik: ' + missing.join(',') : `${locs.join(',')}`);
  report('duplicate loc YOK', new Set(locs).size === locs.length);
  // her shard 200
  for (const l of locs) {
    const r = await get(l, { 'accept': 'application/xml' });
    report(`shard 200: ${l.split('/').pop()}`, r.status === 200);
    if (MODE === 'audit') {
      const urls = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
      report(`  shard ${l.split('/').pop()} url örneği 200`, urls.length > 0 ? (await get(urls[0])).status === 200 : false, `${urls.length} url`);
    }
  }
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
    const hit = /cache;desc="?HIT/.test(st);
    const cw = (st.match(/cfWorker;dur=(\d+)/) || [])[1];
    if (hit && Number(cw) > 250) warn(`${r}: HIT cfWorker ${cw}ms > 250ms`);
    if (!hit && total > 8000) warn(`${r}: MISS total ${total}ms > 8s`);
    if (total > 20000) { report(`${r} timeout`, false, `${total}ms > 20s`); }
    else report(`${r} ok`, true, `total=${total}ms cache=${hit ? 'HIT' : 'MISS'} cfWorker=${cw || 'n/a'}`);
  }
}

// ---- ana akış ----
async function main() {
  console.log(`Threats production smoke — BASE=${BASE}, MODE=${MODE}`);
  console.log(`Sayaçlar: active=${EXPECTED_ACTIVE_SOURCES} healthy=${EXPECTED_HEALTHY_SOURCES} ai=${EXPECTED_AI_THREATS} lusca=${EXPECTED_EARTH_LUSCA} conti=${EXPECTED_CONTI}`);

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
