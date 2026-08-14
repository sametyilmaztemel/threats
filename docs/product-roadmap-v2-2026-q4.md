# threats.0rce.com — Geliştirme Önerileri Listesi v2 (Mevcut Duruma Göre)

**Tarih:** 14 Ağustos 2026 · **Önceki 10 öneri:** Tamamlandı (Ö1-Ö10)

---

## MEVCUT DURUM (v2 öncesi)

| Katman | Değer |
|---|---|
| Doküman | 2.543 (290 tanesi 500+ kelime, ort 218 kelime) |
| IOC | 119.047 (doküman bağlantısı: 2.431) |
| CVE | 1.252 zenginleştirilmiş (CVSS/vendor/product) |
| AI tehdit | 6.161 |
| Aktör | 195 (118 APT, 21 ransomware) — 254 dokümanda eşleşmiş |
| Teknik | 863 (1.853 doküman bağlantısı) |
| Kill chain | 1.893 doküman atanmış |
| Sektör | 912 doküman etiketli (8 sektör) |
| Kaynak | 45 aktif (4 TR dahil) |
| Rapor | Günlük PDF otomatik (1 arşiv kaydı) |
| API | /api/v1 (documents/iocs/cves/reports) + /feed.xml Atom |
| Arama | Postgres FTS (tsvector + GIN) |

---

## YENİ ÖNERİLER (v2 — öncelik sırasıyla)

### Y1 — Aktör-doküman eşleştirme derinleştirme  [P0]
**Neden:** 195 aktör var ama sadece 254 dokümanda eşleşme var (10%). MITRE
aliases'leri dokümanlarda geçiyor ama bağlanmamış.
**Ne:** Aliases tabanlı eşleştirme: her aktörün aliases'ini (APT28=Fancy Bear,
Sofacy) doküman title+content'ta ara → documents.actors + document_actors.
**Nasıl:** mevcut content-backfill'e aliases eşleştirme ekle (regex: alternation).
**Etki:** Aktör sayfaları 254 → 1.500+ dokümana ulaşır; graph anlamlı olur.

### Y2 — IOC bağlantı derinleştirme (host bazlı)  [P0]
**Neden:** 119K IOC var, 2.431 bağlantı. malicious_url'lerin host kısmı dokümanlarda
geçiyor ama full URL eşleşmesi nadir.
**Ne:** IOC değerlerinden host çıkar (URL → domain), dokümanlarda domain geçişini de
eşleştir. Ayrıca ssl_sha1'leri (6K) dokümanlarda geçen sertifika parmak izleriyle bağla.
**Etki:** Bağlantı 2.431 → 10K+.

### Y3 — Teknik-detay sayfaları (ATT&CK profilleri)  [P0]
**Neden:** 863 teknik var ama sadece grafikte node olarak görünüyor. Detay sayfası yok.
**Ne:** /technique/[id] sayfası: açıklama, taktik, ilişkili dokümanlar, ilişkili aktörler,
mitigation (MITRE'den), örnek yazılımlar (STIX x-mitre references).
**Nasıl:** collect-stix zaten description+detection+mitigation çekiyor mu kontrol et —
yoksa STIX'ten mitigation/detection alanlarını da sakla.
**Etki:** Teknikler 863'ü tıklanabilir kaynak olur.

### Y4 — Zaman serisi trend analizi (kill chain × sektör çapraz)  [P1]
**Neden:** /trends var ama tek boyutlu (severity). Kill chain + sektör + aktör çapraz
trendleri eksik.
**Ne:** /trends'e çapraz grafikler: sektör bazında kill chain dağılımı, aktör bazında
zaman serisi, CVE yaşı dağılımı. Saf CSS/SVG (ek kütüphane yok).
**Etki:** Raporlama değeri artar.

### Y5 — PDF rapor zenginleştirme (grafikler + detay)  [P1]
**Neden:** Günlük PDF 2.2KB — metin tabanlı, görsel yok.
**Ne:** pdfkit ile basit bar chart çiz (saf rect: sektör, kill chain, günlük trend).
Günlük rapora "son 24h önemli olaylar" bölümü ekle.
**Etki:** Rapor kurumsal görünür.

### Y6 — Search ranking iyileştirme (ts_rank + filtre kombinasyonu)  [P1]
**Neden:** FTS var ama sıralama fetch tarihi — ilgililik sıralaması yok.
**Ne:** `ORDER BY ts_rank(d.search_vector, plainto_tsquery(...)) DESC` aramalı
sorgularda; filtreler (sev/actor) ile kombine.
**Etki:** Arama kalitesi bariz artar.

### Y7 — Kaynak izleme alarmı (ölü feed tespiti)  [P1]
**Neden:** Kaynaklar zamanla ölür (24 kaynak disable edilmişti). Proaktif tespit yok.
**Ne:** Worker her koşuda: 3 ardışık boş/hatalı çekim → sources.enabled=false +
alert-webhook'a bildirim. /sources sayfasında "son N gün boş" işareti.
**Etki:** Otomatik kaynak hijyeni.

### Y8 — CVE sayfasına EPSS + KEV entegrasyonu  [P1]
**Neden:** cve_enrichment'ta CVSS var ama EPSS (istismar olasılığı) ve CISA KEV
(bilinen istismar) yok — CTI'da kritik önceliklendirme metriği.
**Ne:** FIRST EPSS (kaynak zaten var, çalışıyor) + CISA KEV JSON'ı → cve_enrichment
kolonları (epss, kev). CVE listesine EPSS sıralaması/seçici ekle.
**Etki:** "Hangisi önce yamalanmalı?" sorusuna cevap — gerçek CTI değeri.

### Y9 — Aktör ilerleme/ilişki grafiği (actor graph)  [P2]
**Neden:** /graph genel; aktör-aktör ilişkisi (birlikte anılma) görünmüyor.
**Ne:** /actor/[name] sayfasına "co-mentioned actors" ağ görseli (vis-network zaten
graph'ta kullanılıyor — componenti paylaş).
**Etki:** Aktör profilleri derinleşir.

### Y10 — Export formatları (STIX/CSV/JSONL)  [P2]
**Neden:** /api/v1 JSON var ama CTI araçları STIX/CSV bekler (MISP import, OpenCTI).
**Ne:** /api/v1/export?format=stix|csv|jsonl — doküman/IOC/CVE setini STIX 2.1 bundle
veya CSV olarak dışa aktar.
**Etki:** Platformdan dışa veri çekme — "kaynak" olmanın olmazsa olmazı.

### Y11 — Doküman benzerlik/ilintili öneriler  [P2]
**Neden:** getRelatedDocuments var (CVE/aktör/teknik ortaklığı) ama benzerlik yok.
**Ne:** Basit TF-IDF/cosine (tsvector üzerinden) ile "benzer raporlar" bölümü.
**Etki:** Keşif deneyimi.

### Y12 — Kullanıcı panosu (favorites/bookmarks)  [P2]
**Neden:** Public vitrin ama kayıt/kişiselleştirme yok.
**Ne:** localStorage tabanlı favori doküman/CVE listesi (auth yok — K4 gereği).
Cookie/localStorage ile /bookmarks sayfası.
**Etki:** Araştırmacılar için pratik değer.

### Y13 — TR içerik derinleştirme (USOM API + KVKK)  [P2]
**Neden:** 4 TR kaynak eklendi ama USOM (ulusal CERT) hâlâ ulaşılamıyor — HTML/JS.
**Ne:** USOM verileri için JSON API arayüzü ara (usom.gov.tr/api?) veya sayfa
scrape'leme (hafif, rate-limit'li). KVKK kararları özeti.
**Etki:** Ulusal tehdit görünürlüğü.

### Y14 — Haftalık özet e-posta/bülten  [P3]
**Neden:** Raporlar PDF olarak diskte; abonelik yok.
**Ne:** Worker Pazar günü haftalık PDF + özet → SMTP e-posta (ALERT_WEBHOOK_URL
gibi env ile). .env.example'a ekle.
**Etki:** "Kaynak"tan "servis"e geçiş.

### Y15 — Veri kalitesi skoru (doküman başına)  [P3]
**Neden:** Bazı dokümanlar hâlâ kısa (summary-only). Kalite şeffaflığı yok.
**Ne:** documents.quality_score: word_count + entity zenginliği + kaynak tier'ından
hesaplanan 0-100 skor. Feed'de rozet, filtre (quality=high).
**Etki:** Araştırmacı güveni.

---

## ÖNCELİK MATRİSİ

| Öncelik | Öneri | Etki | Efor | Durum |
|---|---|---|---|---|
| P0 | Y1 Aktör eşleştirme derin | Çok yüksek | Orta | 254 → 1500+ bağlantı |
| P0 | Y2 IOC host eşleştirme | Yüksek | Düşük | 2.4K → 10K+ bağlantı |
| P0 | Y3 Teknik detay sayfaları | Yüksek | Orta | 863 teknik kaynak olur |
| P1 | Y4 Çapraz trend analizi | Orta | Orta | Rapor derinliği |
| P1 | Y5 PDF grafikler | Orta | Düşük | Kurumsal görünüm |
| P1 | Y6 Search ranking | Orta | Düşük | ts_rank |
| P1 | Y7 Ölü feed alarmı | Orta | Düşük | Otomatik hijyen |
| P1 | Y8 EPSS + KEV | Yüksek | Orta | Önceliklendirme metriği |
| P2 | Y9 Aktör ilişki grafiği | Orta | Orta | Profil derinliği |
| P2 | Y10 STIX/CSV export | Yüksek | Orta | Dışa veri akışı |
| P2 | Y11 Benzerlik önerisi | Orta | Orta | Keşif |
| P2 | Y12 Favoriler | Düşük | Düşük | Kişiselleştirme |
| P2 | Y13 TR derinleştirme | Orta | Orta | Ulusal görünürlük |
| P3 | Y14 E-posta bülteni | Orta | Orta | Servis modeli |
| P3 | Y15 Kalite skoru | Düşük | Düşük | Güven |

**Önerilen uygulama sırası:** Y1 → Y2 → Y3 → Y8 → Y6 → Y7 → Y5 → Y4 → Y10 → Y9 → Y11 → Y13 → Y12 → Y14 → Y15

*Not: Y8 (EPSS+KEV) özellikle değerli — kaynaklar zaten mevcut (FIRST EPSS çalışıyor,
CISA KEV JSON'u test edildi), sadece enrichment pipeline'a eklenmeli.*
