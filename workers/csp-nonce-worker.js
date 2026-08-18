// csp-nonce-worker.js — PRODUCTION v3: unique per-request nonce + ham HTML edge cache.
// 522 fix: ctx.waitUntil(cache.put()) 522 veriyordu; await cache.put() 200 veriyor.
// Body tek kez okunur (resp.text()) hem cache'e hem nonce transform'a kullanılır.
//
// Katmanlar:
//  - isHardBypass: static/API/RSC/prefetch/XML/sitemap -> origin'e dokunmadan proxy
//  - isPrivate: /bookmarks + auth/cookie -> cache'lenmez ama nonce transform ALIR
//  - public: ham HTML'i Cache API'de tutar (HIT/Age artar), nonce'lu çıktı cache'e YAZILMAZ
//  - Server-Timing: cfWorker;dur + cache;desc eklenir
//  - Insights: static.cloudflareinsights.com script-src'e eklendi (CSP ihlali biter)

const NONCE_BYTES = 16;
function genNonce() {
  // crypto.randomUUID — güvenli, her çağrıda unique, 128 bit (crypto.getRandomValues bu
  // Worker runtime'ında deterministik/sıfır üretebiliyordu).
  return crypto.randomUUID().replace(/-/g, '');
}
function buildCSP(n) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${n}' https://static.cloudflareinsights.com`,
    "style-src 'self'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}
function isHardBypass(req) {
  const url = new URL(req.url), p = url.pathname, m = (req.method || '').toUpperCase();
  if (m !== 'GET' && m !== 'HEAD') return true;
  if (p.startsWith('/_next/static') || p.startsWith('/_next/image') || p.startsWith('/favicon') ||
      p.startsWith('/sitemaps') || p === '/sitemap.xml' || p.includes('og.png')) return true;
  if (p.startsWith('/api/') || p.startsWith('/admin') || p.startsWith('/auth')) return true;
  if (req.headers.get('RSC')==='1' || req.headers.get('rsc')==='1' ||
      req.headers.get('Next-Router-Prefetch')==='1' || req.headers.get('Next-Router-State-Tree')) return true;
  const accept = req.headers.get('Accept') || '';
  if (accept && !accept.includes('text/html')) return true;
  return false;
}
function isPrivate(req) {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/bookmarks')) return true;
  if (req.headers.get('authorization')) return true;
  if ((req.headers.get('cookie') || '').includes('session')) return true;
  return false;
}
async function fetchOrigin(req, env) {
  const u = new URL(req.url); u.hostname = 'origin-threats.0rce.com';
  const h = new Headers(req.headers);
  h.set('X-Origin-Auth', env.ORIGIN_AUTH_SECRET || '');
  h.delete('cookie'); h.delete('authorization'); h.delete('cf-connecting-ip'); h.delete('cf-ray');
  h.set('X-Forwarded-Proto', 'https');
  return fetch(new Request(u, { method: 'GET', headers: h, redirect: 'manual' }));
}

export default {
  async fetch(request, env) {
    const t0 = Date.now();
    const cache = caches.default;
    const url = new URL(request.url);
    const cacheKey = 'https://csp-cache' + url.pathname + url.search;

    if (isHardBypass(request)) return fetch(request);
    const privateReq = isPrivate(request);

    try {
      let html, cacheStatus = privateReq ? 'BYPASS' : 'MISS';
      let baseHeaders;

      if (!privateReq) {
        const cached = await cache.match(cacheKey);
        if (cached) {
          cacheStatus = 'HIT';
          baseHeaders = cached.headers;
          html = await cached.text();
        } else {
          cacheStatus = 'MISS';
          const resp = await fetchOrigin(request, env);
          if (resp.status >= 300) return resp;
          const ct = resp.headers.get('content-type') || '';
          if (!ct.includes('text/html')) return addTiming(resp, t0, cacheStatus);
          baseHeaders = resp.headers;
          html = await resp.text();
          // ham HTML'i cache'e yaz (await — waitUntil 522 yapıyordu)
          await cache.put(cacheKey, new Response(html, {
            headers: { 'content-type': ct, 'cache-control': 'public, max-age=60, s-maxage=60' }
          }));
        }
      } else {
        // private: her zaman origin, cache'e yazma, ama nonce transform uygula
        const resp = await fetchOrigin(request, env);
        if (resp.status >= 300) return resp;
        const ct = resp.headers.get('content-type') || '';
        if (!ct.includes('text/html')) return addTiming(resp, t0, cacheStatus);
        baseHeaders = resp.headers;
        html = await resp.text();
      }

      // nonce + CSP (public & private HTML ikisi de)
      const nonce = genNonce();
      const newBody = html.replace(/<script\b/g, '<script nonce="' + nonce + '"');
      const h = new Headers(baseHeaders);
      h.set('Content-Security-Policy', buildCSP(nonce));
      h.set('Cache-Control', 'private, no-store'); // nonce'lu çıktı cache'e yazılmaz
      h.delete('cloudflare-cdn-cache-control'); h.delete('set-cookie');
      return addTiming(new Response(newBody, { status: 200, headers: h }), t0, cacheStatus);
    } catch (e) {
      return new Response('Worker error', { status: 502 });
    }
  }
};

function addTiming(r, t0, st) {
  const h = new Headers(r.headers);
  h.append('Server-Timing', `cfWorker;dur=${Date.now() - t0}`);
  if (st) h.append('Server-Timing', `cache;desc="${st}"`);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}
