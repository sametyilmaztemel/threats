// csp-nonce-worker.js — Cloudflare Worker: unique per-request CSP nonce.
// Mimarisi (samet spesifikasyonu):
//  - Yalnızca normal document HTML isteklerini dönüştürür (Accept: text/html, GET/HEAD).
//  - Origin'den gelen HAM (nonce'suz) HTML', Cache API'de (s-maxage'e yakın) tutulur.
//  - Her kullanıcı isteğinde yeni kriptografik nonce üretilir.
//  - Cache'lenmiş ham HTML, kullanıcıya gönderilmeden hemen önce HTMLRewriter ile dönüştürülür.
//  - Tüm <script> etiketlerine aynı isteğin nonce'u eklenir.
//  - Response CSP başlığına yalnızca o response'un nonce'u yazılır.
//  - Nonce eklenmiş son kullanıcı cevabı tekrar ortak cache'e yazılmaz. (transform edilen memory'de durur)
//  - static asset/API/RSC/prefetch/JSON/XML/sitemap dönüştürülmez.
//  - 3xx/4xx/5xx cache'lenmez. Auth/RSC/private bypass. cf-cache-status sahtelenmez.

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
  if (!['GET','HEAD'].includes((request.method||'').toUpperCase())) return true;
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
    if (shouldBypass(request)) {
      return fetch(request); // origin'e dokunmadan proxy (static/asset/API/RSC/prefetch)
    }

    const url = new URL(request.url);
    const originBase = env.ORIGIN || 'https://threats.0rce.com';
    // Cache key: path + query string dahil (farklı query = farklı sayfa)
    const cacheKeyUrl = 'https://' + (env.CACHE_HOST || 'csp-threats-cache') + url.pathname + url.search;
    const cache = caches.default;

    try {
      // 1) Ham HTML'i cache'ten dene
      let originResp = await cache.match(cacheKeyUrl);

      // 2) Cache'te yoksa origin'den çekip cache'e yaz (HAM HTML — nonce'suz)
      if (!originResp) {
        const originReq = new Request(originBase + url.pathname + url.search, request);
        originResp = await fetch(originReq);
        if (originResp.status >= 300) return originResp; // hata cache'leme
        const ct = originResp.headers.get('content-type')||'';
        if (!ct.includes('text/html')) return originResp;
        // Ham HTML'i 120s cache'e yaz (origin bunu zaten s-maxage ile istiyor)
        const r = new Response(originResp.body, { headers: { 'content-type': ct } });
        ctx.waitUntil(cache.put(cacheKeyUrl, r.clone()));
      } else {
        // Stale ham HTML kullanılırken arka planda tazele
        ctx.waitUntil((async()=>{
          const fresh = await fetch(originBase + url.pathname + url.search, request);
          if (fresh.status < 300) await cache.put(cacheKeyUrl, fresh.clone());
        })());
      }

      // 3) Unique nonce üret + HTMLRewriter ile script'lere ekle
      const nonce = genNonce();
      const rewriter = new HTMLRewriter();
      rewriter.on('script', { element(el) { el.setAttribute('nonce', nonce); } });
      const transformed = rewriter.transform(originResp);

      // 4) CSP başlığı + transform edilmiş response'u cache'E YAZMA (memory katmanında kalır)
      const finalHeaders = new Headers(transformed.headers);
      finalHeaders.set('Content-Security-Policy', buildCSP(nonce));
      finalHeaders.set('Cache-Control', 'private, no-store'); // nonce'lu HTML paylaşılmaz
      finalHeaders.delete('Cloudflare-CDN-Cache-Control');

      return new Response(transformed.body, {
        status: originResp.status,
        statusText: originResp.statusText,
        headers: finalHeaders,
      });
    } catch (e) {
      return new Response('Worker error: ' + e.message, { status: 502 });
    }
  }
};
