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

// ---- Live Feed (ana sayfa) ----
// Çıktı: { docIds: [..unique..], signalTimestamp: Date|null, feedItems: [{ id, relative, approxTs }|null] }
// verify: sortedDesc (yeni->eski), maxAgeHours içinde (en yeni), non-decreasing order.
// Herhangi bir koşulda sessiz PASS üretmez: veri yoksa hata string'i döner (smoke FAIL eder).

export function parseLiveFeed(html, opts = {}) {
  if (html == null || html.length === 0) {
    return { docIds: [], signalTimestamp: null, feedItems: [], errors: ['empty body'] };
  }

  // 1) tüm /document/<id> linkleri (duplicate kaldırıldı, sıra korunur)
  const seen = new Set();
  const docIds = [];
  for (const m of html.matchAll(/\/document\/(\d+)/g)) {
    const id = m[1];
    if (!/^[1-9]\d*$/.test(id)) continue; // yalnız pozitif int
    if (seen.has(id)) continue;
    seen.add(id);
    docIds.push(id);
  }

  // 2) SIGNAL ACTIVE zamanı (ana sayfa ingestion referansı)
  let signalTimestamp = null;
  const sig = html.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})<!-- -->Z/);
  if (sig) {
    // ISO8601 'Z' UTC
    const iso = sig[1].replace(' ', 'T') + 'Z';
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) signalTimestamp = d;
  }

  // 3) doc item'ları: relative ago parse et -> mutlak (signalTimestamp referans)
  // Pattern: "6h ago" / "12h ago" / "just now" / "3d ago" / "47m ago"
  // Ana sayfada her doc yanında: '<span>6h ago</span>' görünür.
  // İlk N tane unique (docId + relative) çıkar.
  const feedItems = [];
  const agoSeen = new Set();
  const agoRe = /(\d+)\s*([mhd])\s*ago/i;
  // SIGNAL etrafında, doc bağlamını ara: relative ago metni.
  // Basit: html'i tarayıp relative ago'ların docId'sini yakınlıkla eşle.
  // RSC payload'da sıralı: docId, title, ...ago. item'ı sırasıyla çıkar.
  const re = /(?:href="\/document\/(\d+)"|"effectiveDate":"([^"]+)"|(\d+)\s*([mhd])\s*ago)/g;
  let m;
  const items = [];
  while ((m = re.exec(html)) !== null) {
    if (m[1]) items.push({ kind: 'id', value: m[1] });
    else if (m[2]) items.push({ kind: 'iso', value: m[2] });
    else if (m[3]) items.push({ kind: 'ago', value: `${m[3]}${m[4]}` });
  }
  // id -> sırasıyla relative ve iso eşle (heuristic):
  // "id, ..., ago" üçlüsü içinde ardışık grupla.
  const seenId = new Set();
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind !== 'id') continue;
    const id = items[i].value;
    if (!/^[1-9]\d*$/.test(id)) continue;
    if (seenId.has(id)) continue; // aynı doc'un tekrarı -> atla
    seenId.add(id);
    const out = { id, relative: null, approxTs: null };
    // ileri: 8 token içinde ago veya iso ara
    for (let j = i + 1; j < Math.min(i + 12, items.length); j++) {
      if (items[j].kind === 'id') break;
      if (items[j].kind === 'ago' && !out.relative) {
        out.relative = items[j].value;
        const am = out.relative.match(/^(\d+)([mhd])$/i);
        if (am) {
          const n = Number(am[1]);
          const unit = am[2].toLowerCase();
          const ms = unit === 'm' ? n * 60_000 : unit === 'h' ? n * 3_600_000 : n * 86_400_000;
          if (signalTimestamp) out.approxTs = new Date(signalTimestamp.getTime() - ms);
        }
      } else if (items[j].kind === 'iso' && !out.approxTs) {
        const d = new Date(items[j].value);
        if (!Number.isNaN(d.getTime())) out.approxTs = d;
      }
    }
    feedItems.push(out);
  }

  // 4) errors / doğrulamalar burada değil; smoke katmanı parse çıktısını kullanır.
  return { docIds, signalTimestamp, feedItems, errors: [] };
}

// Live Feed doğrulama: azalan sıra, maxAgeHours, doc sayısı.
// signalTimestamp null ise (örn. bozuk) doğrulama PASS üretMEZ (FAIL eğilimli).
export function verifyLiveFeed(parsed, opts = {}) {
  const maxAgeHours = Number(opts.maxAgeHours ?? 48);
  const minItems = Number(opts.minItems ?? 1);
  const errors = [];

  if (!parsed) errors.push('no parsed');
  if (parsed && parsed.docIds.length < minItems) errors.push(`doc count < ${minItems}`);
  if (parsed && !parsed.signalTimestamp) errors.push('signal timestamp not found');
  if (parsed && parsed.signalTimestamp) {
    const oldest = parsed.feedItems[parsed.feedItems.length - 1];
    if (oldest && oldest.approxTs) {
      const ageHours = (parsed.signalTimestamp - oldest.approxTs) / 3_600_000;
      if (ageHours > maxAgeHours * 6) errors.push(`en eski doc çok eski: ${ageHours.toFixed(1)}h`);
    } else if (parsed.docIds.length > 0) {
      // yaklaşıkTs yoksa yine de kontrol et
      errors.push('doc tarihi parse edilemedi (ago/iso)');
    }
  }
  // azalan sıra doğrula (ilk N feedItems approxTs'ye göre)
  if (parsed && parsed.feedItems.length > 1) {
    for (let i = 1; i < parsed.feedItems.length; i++) {
      const a = parsed.feedItems[i - 1];
      const b = parsed.feedItems[i];
      if (a.approxTs && b.approxTs && a.approxTs < b.approxTs) {
        // sig referansına göre "yeni -> eski": bir önceki yeni olmalı
        errors.push(`sıra bozuk: ${a.id} (${a.approxTs.toISOString()}) < ${b.id} (${b.approxTs.toISOString()})`);
        break;
      }
    }
  }
  // en yeni doc maxAgeHours içinde mi?
  if (parsed && parsed.feedItems.length > 0 && parsed.signalTimestamp) {
    const newest = parsed.feedItems[0];
    if (newest.approxTs) {
      const ageHours = (parsed.signalTimestamp - newest.approxTs) / 3_600_000;
      if (ageHours > maxAgeHours) {
        errors.push(`en yeni doc ${ageHours.toFixed(1)}h (max ${maxAgeHours}h)`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
