// csp-nonce-worker.js — Cloudflare Worker: threats.0rce.com HTML'ine unique CSP nonce enjekte eder.
// - Her <script> etiketine unique nonce attribute ekler.
// - Content-Security-Policy header'ını nonce'lu üretir (script-src 'self' 'nonce-...').
// - HTML yanıtları edge'de cache'lenmemeli (no-store) ki nonce tekrar kullanılmasın.
// - Static asset'ler (_next/static, css, js, images, sitemap) Worker'a uğramadan cache'lenir.
// Deploy: wrangler bu dosyayla kurulur, zone route threats.0rce.com/* -> worker.

// Bu Worker, tunnel'dan gelen origin'e fetch eder ve HTML'i nonce'larla işler.
// NOT: Bu gerçek çözümde origin'e (tunnel arkası 127.0.0.1:27100) fetch yapar.

const NONCE_LEN = 32;
function genNonce() {
  // crypto.getRandomValues ile 32byte -> base64url
  const arr = new Uint8Array(NONCE_LEN);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// HTMLRewriter: her script etiketine nonce ekle
async function handleHTML(response, nonce) {
  const htmlRewriter = new HTMLRewriter();
  htmlRewriter.on('script', {
    element(el) { el.setAttribute('nonce', nonce); }
  });
  const newResponse = htmlRewriter.transform(response);
  return newResponse;
}

function buildCSP(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Static assetler -> Worker'ı bypass (origin'e proxy, CF normal cache)
    if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/favicon') || url.pathname.includes('og.png') || url.pathname.startsWith('/sitemaps') || url.pathname === '/sitemap.xml') {
      return fetch(request);
    }

    // Origin'e fetch (tunnel arkası). Origin base'i env'den.
    const originBase = env.ORIGIN || 'http://127.0.0.1:27100';
    const originUrl = originBase + url.pathname + url.search;
    const originReq = new Request(originUrl, request);

    try {
      const originResp = await fetch(originReq);
      const nonce = genNonce();
      const contentType = originResp.headers.get('content-type') || '';
      let finalResp = originResp;

      // HTML ise nonce ekle
      if (contentType.includes('text/html')) {
        finalResp = await handleHTML(originResp, nonce);
        // CSP header üret
        finalResp.headers.set('Content-Security-Policy', buildCSP(nonce));
        // Nonce'lu HTML'i cache'leme (unique nonce korunur)
        finalResp.headers.set('Cache-Control', 'public, no-store');
        finalResp.headers.delete('Cloudflare-CDN-Cache-Control');
      }
      // CSP Report-Only (ilk aşamada ihlalleri izle)
      // finalResp.headers.set('Content-Security-Policy-Report-Only', buildCSP(nonce));

      return finalResp;
    } catch (e) {
      return new Response('Worker error: ' + e.message, { status: 502 });
    }
  }
};
