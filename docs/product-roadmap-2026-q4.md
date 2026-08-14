# threats.0rce.com — Kaynak Ürün Yol Haritası (Öneri Detayları)

**Tarih:** 14 Ağustos 2026 · **Durum:** Prod altyapı + içerik katmanı tamamlandı
**Repo:** 0rce-Labs/threats-0rce · **Canlı:** threats.0rce.com

---

## MEVCUT DURUM (tamamlanan)

| Katman | Durum |
|---|---|
| Altyapı | Docker compose, build'li image, 127.0.0.1 bind, mem limit, healthcheck |
| Toplama | RSS (21 kaynak) + IOC (URLhaus, Feodo, OpenPhish, SSLBL...) + GHSA advisory |
| Otomasyon | Worker servisi 6 saatte bir: RSS → IOC → GHSA → backfill |
| Zenginleştirme | Aktör (151 bağlantı), teknik (1890), sektör (1049), kill chain (1732), AI summary (2395) |
| CVE | 1252 zenginleştirilmiş (CVSS/vendor/product), otomatik normalizasyon |
| Rapor | /reports (haftalık özet, sektör, aktör, kill chain, IOC, kaynak sağlığı) + PDF export |
| Arama | Full-text (title/summary/content/author/actors/cves/tags/sectors) |
| Aktör | Profil + 90 gün timeline grafiği |
| Güvenlik | Next 14.2.35, rate limit, backup timer (03:17 UTC) |

**Veri:** 2397 doküman · 101.848 IOC · 1252 CVE · 5676 AI threat · 41 aktif kaynak

---

## ÖNERİLER (öncelik sırasıyla)

### Ö1 — MITRE ATT&CK / ATLAS aktör + teknik veritabanı genişletme  [P0]
**Neden:** Şu an 10 aktör + 10 teknik var — gerçek bir CTI kaynağında 100+ aktör olur.
**Ne:** `sources` tablosundaki MITRE ATT&CK STIX feed'i (48MB, çalışıyor ama işlenmiyor)
işlenmeli: enterprise-attack.json → actors (gruplar) + techniques (14 taktik) + software.
**Nasıl:**
- `collect-stix.ts` yaz: STIX bundle parse → `actors` (type=threat-actor, aliases,
  description, origin_country, first_seen) + `techniques` (ATT&CK ID'si, taktik, platform)
- ~140 aktör + 500+ teknik beklenir (şu an 10/10)
- İlk seferde full sync, sonra incremental (modified timestamp)
- Dokümanlarda STIX teknik ID eşleştirme (T1059 gibi kodlar zaten içerikte geçiyor)
**Çıktı:** Aktör sayfası 100+, teknik sayfası 500+, graph anlamlı büyür.

### Ö2 — Tam metin çekici (full-text fetcher)  [P0]
**Neden:** Ortalama content 896 char — çoğu kaynak sadece RSS summary veriyor.
Gerçek kaynak ürün tam makale içeriği sunmalı.
**Ne:** RSS'ten gelen URL'leri arka planda çekip tam içeriği `content`'e yaz.
**Nasıl:**
- `fetch-fulltext.ts`: 6 saatlik worker döngüsünde `word_count < 200` olan dokümanların
  URL'lerini çek (hafif HTML→text: `node-html-markdown` veya regex strip)
- Kaynak başına politika: vendor blogları (CrowdStrike, Palo Alto) tam metin verir;
  arXiv zaten abstract verir — atla
- Robot koruması (403/429) olanlarda summary ile devam
- rate-limit: 2 req/s, timeout 15s, max 5000 doküman/koşu
**Çıktı:** Dokümanların %40-60'ı 500+ kelimeye ulaşır; arama + AI summary kalitesi artar.

### Ö3 — IOC-doküman eşleştirme genişletme  [P1]
**Neden:** 101K IOC var ama `doc_mentions` zayıf — doküman detayında "ilgili IOC'ler"
bölümü çoğunlukla boş.
**Ne:** Tüm dokümanların title+content'ında IOC değerlerini tara (IP, domain, hash, URL).
**Nasıl:**
- SQL tarama yerine chunk'lı Python/TS: her doküman için regex ile IP/domain/hash/URL
  çıkar → `iocs` tablosunda eşleşenleri `document_iocs` junction'a yaz
- Önce domain/IP (yüksek değer), sonra hash'ler
- Mevcut document_iocs 249 satır → hedef 5000+
**Çıktı:** Doküman detayında IOC listesi + IOC sayfasında "hangi raporlarda geçiyor".

### Ö4 — Sektör sayfaları + sektör timeline'ları  [P1]
**Neden:** /reports'ta sektör özeti var ama tıklanabilir değil.
**Ne:** `/sector/[name]` sayfası: sektöre özgü doküman listesi, kritik dağılım,
aktör haritası, 90 gün timeline (aktör sayfasındaki grafik gibi).
**Nasıl:** getActorTimeline benzeri `getSectorTimeline(name)` + mevcut query'ler.
**Çıktı:** Finance/healthcare/government/defense için 4+ derinlemesine sektör analizi sayfası.

### Ö5 — Public API + kendi RSS/Atom feed'i  [P1]
**Neden:** "Kaynak olmak" = başka sistemlerin tüketebilmesi. Şu an sadece HTML UI var.
**Ne:** `/api/v1/` route'ları: documents (filtreli), iocs, cves, actors, search.
Ayrıca `/feed.xml` (Atom) — başka CTI araçları abone olabilir.
**Nasıl:**
- Next route handlers: GET /api/v1/documents?limit=&source=&sev=&q=
- JSON response, TLP:GREEN, `Cache-Control: max-age=300`
- Atom feed: son 50 doküman, title+summary+url+published
- (Opsiyonel) API key: sadece yazma endpoint'leri için — okuma public
**Çıktı:** curl ile tüketilebilir API; OpenCTI/MISP gibi araçlara bağlanabilir.

### Ö6 — Postgres FTS (tsvector) arama index'i  [P1]
**Neden:** Şu anki ILIKE araması 2400 dokümanda OK ama 100K+ dokümanda yavaşlar.
**Ne:** `documents` üzerine GIN index + `search_vector` kolonu, türkçe/ingilizce config.
**Nasıl:**
- Migration: `ALTER TABLE documents ADD COLUMN search_vector tsvector`
- Trigger ile title/summary/content/actors/cves'ten güncelle
- Feed sorgusu `search_vector @@ plainto_tsquery($q)` → 10-50x hız
**Çıktı:** Ölçeklenebilir arama; gelecek 100K dokümanda da hızlı.

### Ö7 — Otomatik günlük/haftalık rapor arşivi  [P2]
**Neden:** /reports/export manuel; kaynak ürün düzenli rapor üretmeli.
**Ne:** Worker her gece 03:00'te günlük özet PDF + DB'ye `reports` tablosu kaydı;
haftalık Pazar günü kapsamlı PDF. Arşiv sayfası `/reports/archive`.
**Nasıl:** collect.sh'e `generate-report.ts` adımı (pdfkit, mevcut export route'unu
servis olarak çağırır veya aynı kodu kullanır). Backup ile birlikte saklanır.
**Çıktı:** Otomatik günlük PDF arşivi — "kurumsal kaynak" görünümü.

### Ö8 — Yerel/Türkçe CTI içerik  [P2]
**Neden:** TR kaynaklar (BTK, USOM, HAVELSAN, STM) ölü feed — yerel içerik boşluğu.
**Ne:** Canlı TR kaynakları bul (KVKK, SİBERAY blog, TR-CERT RSS, akademik tezler) veya
manuel editöryel giriş (admin paneli yerine SQL seed — şu an admin yok).
**Nasıl:** Kaynak araştırması → sources tablosuna ekle → collect-rss yakalar.
**Çıktı:** Türkçe içerik katmanı — 0rce.com TR pazarıyla uyumlu.

### Ö9 — Kritik olay alert/webhook  [P2]
**Neden:** Kaynak platform izleyicilerine anında bilgi vermeli.
**Ne:** Worker her koşuda `severity >= 9` veya yeni kritik CVE (CVSS >= 9) tespit ederse
webhook (Slack/Telegram) veya email.
**Nasıl:** collect.sh'e alert adımı: son koşudan beri eklenen kritikleri sorgula →
`ALERT_WEBHOOK_URL` env'ine POST. .env.example'a ekle.
**Çıktı:** Gerçek zamanlı uyarı — kurumsal kullanım değeri.

### Ö10 — Detay istatistikler (analytics)  [P2]
**Neden:** Kaynak olarak güvenilirlik için "ne kadar veri, ne kadar güncel" şeffaflığı.
**Ne:** `/stats` sayfası: kaynak başına verim grafiği (son 30 gün doküman/saat),
IOC tipi dağılımı, CVE yaşı dağılımı, kill chain × sektör çaprazı.
**Nasıl:** Mevcut query'lere dayalı; hero'ya küçük "DATA HEALTH" widget'ı.
**Çıktı:** Şeffaflık + demo/raporlama değeri.

---

## ÖNCELİK MATRİSİ

| Öncelik | Öneri | Etki | Efor |
|---|---|---|---|
| P0 | Ö1 ATT&CK aktör/teknik | Çok yüksek (100+ aktör) | Orta (STIX parse) |
| P0 | Ö2 Tam metin çekici | Yüksek (içerik kalitesi) | Orta |
| P1 | Ö3 IOC eşleştirme | Yüksek (bağlantılar) | Düşük-orta |
| P1 | Ö4 Sektör sayfaları | Orta | Düşük |
| P1 | Ö5 Public API + RSS | Yüksek (entegrasyon) | Orta |
| P1 | Ö6 FTS index | Orta (ölçek) | Düşük |
| P2 | Ö7 Rapor arşivi | Orta | Düşük |
| P2 | Ö8 TR içerik | Orta (pazar) | Orta |
| P2 | Ö9 Alert webhook | Orta | Düşük |
| P2 | Ö10 Analytics | Düşük-orta | Düşük |

**Önerilen sıra:** Ö1 → Ö2 → Ö3 → Ö5 → Ö6 → Ö4 → Ö7 → Ö9 → Ö10 → Ö8
(Ö1-Ö3 veri derinliği, Ö5-Ö6 entegrasyon/ölçek, gerisi katma değer)

*Not: Ö8 TR içerik için kaynak bulunamazsa düşürülebilir; Ö9 webhook URL'si Samet'ten
istenir.*
