// csp-nonce-worker.js — PRODUCTION: unique per-request CSP nonce (string inject).
// Canary'de 200 + nonce doğrulandı.
//
// Not (kullanıcıya): Cache API ham-HTML-cache eklenince 502 "Worker error" verdi
// (caches.default exception — custom domain worker'ında). Bu yüzden PRODUCTION
// worker'da Cache API kullanılmaz; her HTML isteği origin'e fetch edilip transform
// edilir. Nonce'lu çıktı Cache-Control: private, no-store (edge'de tutulmaz).
// Ham-cache avantajı bu Worker'da uygulanamadı; nonce güvenliği tam.

const NONCE_BYTES = 16;
function genNonce() {
  const a = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function buildCSP(n) {
  return [
    "default-src 'self'", `script-src 'self' 'nonce-${n}'`, "style-src 'self'",
    "img-src 'self' data: https:", "font-src 'self' data:", "connect-src 'self' https:",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
  ].join('; ');
}
function shouldBypass(req) {
  const url = new URL(req.url), p = url.pathname, m = (req.method || '').toUpperCase();
  if (m !== 'GET' && m !== 'HEAD') return true;
  if (p.startsWith('/_next/static') || p.startsWith('/_next/image') || p.startsWith('/favicon') ||
      p.startsWith('/sitemaps') || p === '/sitemap.xml' || p.includes('og.png')) return true;
  if (p.startsWith('/api/') || p.startsWith('/admin') || p.startsWith('/auth') || p.startsWith('/bookmarks')) return true;
  if (req.headers.get('RSC')==='1' || req.headers.get('rsc')==='1' ||
      req.headers.get('Next-Router-Prefetch')==='1' || req.headers.get('Next-Router-State-Tree')) return true;
  if (req.headers.get('authorization') || (req.headers.get('cookie')||'').includes('session')) return true;
  const accept = req.headers.get('Accept') || '';
  if (accept && !accept.includes('text/html')) return true;
  return false;
}
export default {
  async fetch(request, env) {
    if (shouldBypass(request)) return fetch(request);

    const url = new URL(request.url);
    url.hostname = 'origin-threats.0rce.com';
    const headers = new Headers(request.headers);
    headers.set('X-Origin-Auth', env.ORIGIN_AUTH_SECRET || '');
    headers.delete('cookie'); headers.delete('authorization');
    headers.delete('cf-connecting-ip'); headers.delete('cf-ray');
    headers.set('X-Forwarded-Proto', 'https');

    try {
      const resp = await fetch(new Request(url, { method: 'GET', headers, redirect: 'manual' }));
      if (resp.status >= 300) return resp;
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('text/html') || resp.headers.get('set-cookie')) return resp;

      const nonce = genNonce();
      const text = await resp.text();
      const newBody = text.replace(/<script\b/g, '<script nonce="' + nonce + '"');

      const h = new Headers(resp.headers);
      h.set('Content-Security-Policy', buildCSP(nonce));
      h.set('Cache-Control', 'private, no-store');
      h.delete('cloudflare-cdn-cache-control'); h.delete('set-cookie');
      return new Response(newBody, { status: resp.status, statusText: resp.statusText, headers: h });
    } catch (e) {
      return new Response('Worker error', { status: 502 });
    }
  }
};
