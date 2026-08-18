// lib/parsers.mjs — production-smoke için saf HTML/header parser'ları.
// Bu fonksiyonlar saf ve import edilebilir; scripts/production-smoke.mjs ile test/ kullanır.
// Amaç: production HTML değişikliğinin parser'ı SESSİZCE yanlış sonuçlandırmaması.
// Parser veri bulamazsa `null`/`false` döner — PASS üretmez.

// Header'dan (Raw) belirli bir başlığı case-insensitive çıkar
export function headerGet(rawHeaders, name) {
  for (const line of rawHeaders.split('\n')) {
    const l = line.replace(/\r$/, '');
    if (l.toLowerCase().startsWith(name.toLowerCase() + ':')) {
      return l.split(':').slice(1).join(':').trim();
    }
  }
  return null;
}

// React <!-- --> parçalı HTML'de temiz (footer/sayaç) ilginç bölge
export function stripReactComments(html) {
  return html.replace(/<!--\s*-->/g, '');
}
export function normalizeSpaces(s) {
  return s.replace(/[\u00a0\u00b7\u2009\u202f]/g, ' ');
}

// DOMAIN: actor detay doküman sayısı.
// Öncelik: unique /document/{id} link sayısı, sonra DOCUMENTS blok sayısı.
// Veri bulamazsa null döner (test FAIL olur, PASS değil).
export function extractDocCount(html) {
  if (html == null || html.length === 0) return null;
  const docs = [...html.matchAll(/\/document\/(\d+)/g)].map(m => m[1]);
  if (docs.length > 0) return new Set(docs).size;
  const blk = html.match(/DOCUMENTS[^0-9]{0,40}(\d{1,4})/i);
  if (blk) return Number(blk[1]);
  const m = html.match(/(\d+)\s+(?:document|docs|record|item)/i);
  return m ? Number(m[1]) : null;
}

// DOMAIN: source health parser (footer "N active · M healthy").
// React parçalama + unicode boşluklara toleranslı. Bulamazsa null.
export function parseSourceHealth(html) {
  if (html == null || html.length === 0) return null;
  const clean = stripReactComments(normalizeSpaces(html));
  const m = clean.match(/(\d+)\s+active\s+(\d+)\s+healthy/);
  return m ? { active: Number(m[1]), healthy: Number(m[2]) } : null;
}

// DOMAIN: CSP header'ından nonce değeri (script-src'deki nonce-X).
export function cspNonce(csp) {
  if (!csp) return null;
  const m = csp.match(/\bnonce-([A-Za-z0-9_=-]{6,})/);
  return m ? m[1] : null;
}

// DOMAIN: HTML'deki <script> etiketlerinin nonce değerleri.
// nonce taşımayan script -> null eleman. Boş/sahte HTML'de [] döner.
export function scriptNonces(html) {
  if (html == null || html.length === 0) return [];
  const out = [];
  const re = /<script\b[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const nm = /\bnonce="([^"]+)"/.exec(m[0]);
    out.push(nm ? nm[1] : null);
  }
  return out;
}

// DOMAIN: sitemap index'ten <loc> listesi. bulamazsa [].
export function sitemapLocs(xml) {
  if (xml == null || xml.length === 0) return [];
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
}

// DOMAIN: SEO metadata kontrolü — şu etiketlerden kaçı mevcut + canonical.
export function seoMeta(html) {
  if (html == null || html.length === 0) {
    return { canonical: null, ogUrl: null, hasAll: false, present: {} };
  }
  const present = {
    canonical: /rel="?[^"]*canonical[^"]*"?\s+[^>]*href="/i.test(html),
    ogUrl: /property="og:url"/i.test(html) || /name="og:url"/i.test(html),
    ogImage: /property="og:image"/i.test(html) || /name="og:image"/i.test(html),
    twitterImage: /name="twitter:image"/i.test(html) || /property="twitter:image"/i.test(html),
    title: /<title/i.test(html),
    description: /name="description"/i.test(html),
  };
  const canon = html.match(/rel="[^"]*canonical[^"]*"\s+href="([^"]+)"/i) ||
                html.match(/href="([^"]+)"\s+rel="[^"]*canonical[^"]*"/i);
  const og = html.match(/property="og:url"\s+content="([^"]+)"/i) ||
             html.match(/content="([^"]+)"\s+property="og:url"/i);
  return {
    canonical: canon ? canon[1] : null,
    ogUrl: og ? og[1] : null,
    hasAll: Object.values(present).every(Boolean),
    present,
  };
}

// DOMAIN: Server-Timing header'ları (birden fazla satır olabilir).
// cfWorker dur + cache desc çıkarır.
export function parseServerTiming(serverTimingHeader) {
  const out = { workerDur: null, cache: null, desc: null };
  if (!serverTimingHeader) return out;
  for (const part of serverTimingHeader.split(',')) {
    const t = part.trim();
    if (/^cfWorker;/.test(t)) {
      const m = t.match(/dur=(\d+)/);
      if (m) out.workerDur = Number(m[1]);
    } else if (/^cfCacheStatus;/.test(t)) {
      const m = t.match(/desc="?(\w+)"?/);
      if (m) out.cache = m[1];
    } else if (/^cache;/.test(t)) {
      const m = t.match(/desc="?(\w+)"?/);
      if (m) out.desc = m[1];
    }
  }
  return out;
}
