// csp-nonce-worker.js — Cloudflare Worker: unique per-request CSP nonce.
// Mimarisi (samet spesifikasyonu):
//  - Yalnızca normal document HTML isteklerini (Accept: text/html, GET/HEAD) dönüştürür.
//  - Origin'den gelen HAM (nonce'suz) HTML', Cache API'de tutulur (edge avantajı).
//  - Her kullanıcı isteğinde yeni kriptografik nonce üretilir (128 bit).
//  - Cache'lenmiş ham HTML, kullanıcıya gönderilmeden hemen önce HTMLRewriter ile dönüştürülür.
//  - Tüm <script> etiketlerine aynı isteğin nonce'u eklenir; CSP başlığına o nonce yazılır.
//  - Nonce eklenmiş son cevap ortak cache'e YAZILMAZ.
//  - static/API/RSC/prefetch/JSON/XML/sitemap dönüştürülmez.
//  - Auth, session cookie, Set-Cookie, 3xx/4xx/5xx cache'lenmez.
//  - cf-cache-status taklit edilmez; ham-cache durumu X-Worker-Cache debug header ile gösterilir.
//  - Origin fetch sırasında X-Origin-Auth (Worker Secret) gönderilir.
//  - Parent-domain cookie / Authorization origin'e yayılmaz.

const NONCE_BYTES = 16; // 128 bit
function genNonce() {
  const arr = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildCSP(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
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

function shouldBypass(request) {
  const url = new URL(request.url);
  const p = url.pathname;
  const m = (request.method||'').toUpperCase();
  if (m !== 'GET' && m !== 'HEAD') return true;
  if (p.startsWith('/_next/static') || p.startsWith('/_next/image') || p.startsWith('/favicon') ||
      p.startsWith('/sitemaps') || p === '/sitemap.xml' || p.includes('og.png')) return true;
  if (p.startsWith('/api/') || p.startsWith('/admin') || p.startsWith('/auth') || p.startsWith('/bookmarks')) return true;
  if (request.headers.get('RSC')==='1' || request.headers.get('rsc')==='1' ||
      request.headers.get('Next-Router-Prefetch')==='1' || request.headers.get('Next-Router-State-Tree')) return true;
  if (request.headers.get('authorization') || (request.headers.get('cookie')||'').includes('session')) return true;
  const accept = request.headers.get('Accept')||'';
  if (accept && !accept.includes('text/html')) return true;
  return false;
}

export default {
  async fetch(request, env, ctx) {
    const debug = env.DEBUG === '1';
    const originBase = env.ORIGIN || 'https://origin-threats.0rce.com';
    const authSecret = env.ORIGIN_AUTH_SECRET || '';
    const cache = caches.default;
    const url = new URL(request.url);

    // Bypass rotaları -> doğrudan origin'e proxy (Worker transform etmez, cache etmez)
    if (shouldBypass(request)) {
      return fetch(request);
    }

    // Cache key: host + path + query (farklı query = farklı sayfa)
    const cacheKey = 'https://' + url.host + url.pathname + url.search;

    try {
      // 1) Ham HTML'i cache'ten dene
      let cached = await cache.match(cacheKey);
      let originResp;
      let cacheStatus = 'MISS';

      if (cached) {
        cacheStatus = 'HIT';
        originResp = cached;
        // Stale ham HTML kullanılırken arka planda tazele (revalidate)
        ctx.waitUntil((async () => {
          try {
            const fresh = await fetchOrigin(originBase, url, request, authSecret);
            if (fresh.ok && !fresh.headers.get('set-cookie')) {
              await cache.put(cacheKey, sanitize(fresh));
            }
          } catch {}
        })());
      } else {
        originResp = await fetchOrigin(originBase, url, request, authSecret);
        if (originResp.status >= 300) return originResp; // hata cache'leme
        const ct = originResp.headers.get('content-type')||'';
        if (!ct.includes('text/html')) return originResp;
        // Set-Cookie içeren cevabı cache'leme
        if (!originResp.headers.get('set-cookie')) {
          ctx.waitUntil(cache.put(cacheKey, sanitize(originResp.clone())));
        }
      }

      // 2) Unique nonce + HTMLRewriter
      const nonce = genNonce();
      const rewriter = new HTMLRewriter();
      rewriter.on('script', { element(el) { el.setAttribute('nonce', nonce); } });
      const transformed = rewriter.transform(originResp);

      // 3) CSP + transform edilmiş response cache'e YAZILMAZ
      const finalHeaders = new Headers(transformed.headers);
      finalHeaders.set('Content-Security-Policy', buildCSP(nonce));
      finalHeaders.set('Cache-Control', 'private, no-store');
      finalHeaders.delete('Cloudflare-CDN-Cache-Control');
      if (debug) finalHeaders.set('X-Worker-Cache', cacheStatus);

      return new Response(transformed.body, {
        status: originResp.status,
        statusText: originResp.statusText,
        headers: finalHeaders,
      });
    } catch (e) {
      return new Response('Worker error', { status: 502 });
    }
  }
};

// Origin fetch: yalnızca gerekli header'ları iletir, parent-domain cookie/auth yaymaz.
async function fetchOrigin(originBase, url, request, authSecret) {
  const headers = new Headers();
  // Accept'i koru (HTML için), ama cookie/authorization'ı STRAY-ileme
  headers.set('Accept', request.headers.get('Accept') || 'text/html');
  headers.set('Accept-Language', request.headers.get('Accept-Language') || '');
  headers.set('User-Agent', request.headers.get('User-Agent') || '');
  headers.set('X-Origin-Auth', authSecret);
  // Parent-domain cookie yayma; X-Forwarded-Host değil (origin hostname sızmasın)
  headers.set('X-Forwarded-Proto', 'https');
  return fetch(originBase + url.pathname + url.search, { headers, method: 'GET', redirect: 'manual' });
}

// Cache'e konacak ham HTML: Set-Cookie / auth ile ilgili header'ları temizle
function sanitize(resp) {
  const h = new Headers(resp.headers);
  h.delete('set-cookie');
  h.set('Cache-Control', 'public, max-age=120'); // ham HTML 120s Cache API
  return new Response(resp.body, { headers: h });
}
