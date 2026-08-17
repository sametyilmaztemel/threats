# threats.0rce.com — Kapsamli Durum Raporu

**Tarih:** 17 Agustos 2026  • **Repo:** github.com/0rce-Labs/threats-ror (private)  • **Alan:** threats.0rce.com  
**Mimari:** Next.js 14.2 (App Router) + PostgreSQL 16 + Redis 7 + 4 container (Docker Compose)  
**Surum:** https://0rce-Labs/threats-ror  • **VKN:** GitHub PAT + VPS tunnel

---

## 1. ALTYAPI

### 1.1 Container mimarisi

| Servis          | Container        | Port            | Saglik      | Buyukluk |
|---              |---               |---              |---          |---       |
| threats-app     | Next.js 14.2     | 127.0.0.1:27100 | healthy 5s | 173 MB   |
| threats-worker  | tsx + Node 20    | 3000 (internal) | restarting | 177 MB   |
| threats-postgres| PostgreSQL 16    | 5432            | healthy     | 280 MB   |
| threats-redis   | Redis 7 (alpine) | 6379            | healthy     | 41 MB    |

### 1.2 Worker otomasyon dongusu (her 6 saatte)

`/scripts/collect.sh` — her adim `set -e + || echo "hata (devam)"`:

1. collect-rss      (RSS — yorum / vendor / news / local)
2. collect-ioc      (ThreatFox / MalwareBazaar / URLhaus / Feodo / PhishTank-phishing.army)
3. collect-advisories (GHSA — Linux kernel 113+ template CVE-first)
4. collect-stix     (MITRE ATT&CK — haftada 2 kez, GitHub rate limit durumunda skip)
5. collect-osv      (OSV.dev — PyPI, crates.io, Go, NuGet, OSS-Fuzz, Maven)
6. enrich-epss-kev  (EPSS chunk 100 + CISA KEV — son 7 gün / full scan)
7. sync-cves        (NVD 2.0 — son 24 saat delta)
8. quality-score    (dokuman kalite skoru 0-100)
9. fetch-fulltext   (Wayback fallback, 150 dokuman batch)
10. link-iocs      (host bazli IOC-dokuman eslestirme, 57K+ baglanti)
11. link-actors    (aliases + teknik iliskili, 9K+ baglanti)
12. content-backfill (entity cikarimi + cleanup)
13. alert-webhook  (kritik olay — KEV/CVSS>=9)
14. build-graph     (actor<->technique 3988 edge)
15. daily-stats     (snapshot)
16. dead-feed-alert (3 ardisik bos cekim → disable + alert)
17. email-newsletter (haftalik bulten, SMTP ile, opsiyonel)
18. push-misp      (STIX bundle, opsiyonel)
19. llm-summary    (LLM ile zenginlestirilmis ozet, opsiyonel)

### 1.3 Healthcheck

```
GET /  →  wget -qO- http://127.0.0.1:3000/  (IPv6 localhost bug fixed)
      └─ 30s interval, 5s timeout, 3 retries
```

**Disk:** /dev/sda1 145GB, 106GB kullanilmis (%74), 39GB bos.  
**Memory limit:** worker 256MB, app 512MB, postgres/redis 256MB.

---

## 2. VERI TABANI (PostgreSQL 16)

### 2.1 Tablo envanteri (boyut + yaklasik satir)

| Tablo              | Boyut    | Satir    | Aciklama |
|---                 |---       |---       |---       |
| iocs               | 168 MB   | 530.838  | Her IOC: ip/url/domain/hash |
| cve_enrichment     | 134 MB   | 175.207  | CVE master tablosu (EPS/KEV/CVSS) |
| document_iocs      | 101 MB   | 1.029.895 | Dokuman-IOC iliskileri |
| documents          |  97 MB   |  14.307  | Ana istihbarat govdesi |
| ai_threats         | 3.8 MB   |  31.828  | AI kategorik tehdit haritalandirma |
| document_actors    | 2.6 MB   |  27.347  | Dokuman-aktor iliskileri |
| techniques         | 2.3 MB   |     863  | MITRE ATT&CK teknikleri |
| document_techniques| 1.2 MB   |  10.539  | Dokuman-teknik baglantilari |
| graph_edges        | 1.1 MB   |   3.988  | STIX graphu (aktor<->aktor) |
| actors             | 0.6 MB   |     195  | Tehdit aktoru katalogu |
| document_cves      | 0.3 MB   |   1.749  | Dokuman-CVE baglantilari |
| source_history     | 0.1 MB   |     468  | Kaynak cekim gecmisi |
| sources            | 96 KB    |      77  | Kaynak katalogu |
| reports            | 48 KB    |       3  | PDF rapor metadata |
| daily_stats        | 24 KB    |      60  | 60 gunluk buyume snapshot |
| api_usage          | 16 KB    |       0  | API abuse izleme (yeni) |

**Toplam PG verisi:** ~510 MB (cve_enrichment + iocs + document_* tablolari agirliginda)

### 2.2 CVE zenginlestirme detaylari

| Metrik                              | Deger        |
|---                                  |---           |
| Toplam CVE                           | **175.207**   |
| EPSS'li CVE                          | **167.662** (%96) |
| KEV (CISA Known Exploited)           | **786**        |
| CVSS >= 9.0 (critical)               | 33.811 (%19) |
| CVSS >= 7.0 (high)                   | 88.652 (%51) |
| Son 24 saatte EPSS zenginlestirilen   | 18.358        |

### 2.3 Vendor dagilimi (top 10)

| Vendor     | CVE   | Critical (CVSS>=9) |
|---         |---    |---                |
| linux      | 9.713 | 291               |
| google     | 5.203 | 418               |
| microsoft  | 4.813 | 268               |
| adobe      | 2.880 |  63               |
| apple      | 2.336 | 158               |
| ibm        | 2.095 |  70               |
| tenda      | 1.720 | 546               |
| oracle     | 1.462 |  51               |
| dlink      | 1.189 | 298               |
| qualcomm   | 1.136 |  78               |

### 2.4 IOC envanteri

| Tip                 | Adet       |
|---                  |---         |
| Toplam IOC          | **525.978** |
| Phishing (URL/domain) | 100.000 |
| Attacker/C2 IP      |  18.164 |
| Dokuman-IOC baglantilari | 1.029.895 |

### 2.5 Aktor katalogu

| Tip                  | Adet |
|---                   |---    |
| APT                  | 155   |
| Ransomware gang      |  21   |
| Financially-motivated|  19   |
| **Toplam**           | **195** |

**En cok dokumana sahip aktörler (STIX + teknik iliskili):**

| Aktör           | Dokuman Sayisi | TTP |
|---              |---             |--- |
| LockBit         | 6.756          |  2 |
| APT28           | 6.641          |  3 |
| UNC3886         | 6.618          |  2 |
| Earth Lusca     | 4.255          | 44 |
| Conti           |   853          |  2 |
| Clop            |   696          |  1 |
| Mustang Panda   |   386          |  2 |
| Kimsuky         |   386          |  2 |

### 2.6 MITRE ATT&CK teknikleri (863 toplam)

- Sayfalar: /technique/[id] zenginlestirildi (aktor kullanimi + metadata)
- TTP'ler actors.ttps array'inde — konumlari teknikoji tarafindan islenir
- Phase dagilimi ayrica techniques tablosundan cekilebilir

### 2.7 Dokuman ozellikleri

| Kategori          | Adet   |
|---                |---     |
| package_vulns     | 11.278 |
| vulnerability     |  1.163 |
| ai                |  1.049 |
| cve               |    500 |
| epss_high         |    495 |
| general           |    445 |
| advisory          |    378 |
| iot               |    372 |
| apt               |    197 |
| cloud             |    108 |

| Kill chain'li dokuman | 8.779 |
| Quality >= 60 (high) | 864 /2.869 (yaklasik %) |
| Fulltext >= 200 kelime | 864 (Wayback batch ile artiyor) |

---

## 3. KAYNAK YONETIMI

### 3.1 77 toplam, 20 aktif

| Tier | Tip  | Adet | Ornekler |
|---   |---   |---   |---       |
| 1    | api  |  3   | NVD, GHSA, MITRE ATT&CK, OSV.dev |
| 1    | csv  |  3   | FIRST EPSS, CISA KEV |
| 1    | json |  3   | CISA KEV (json), PhishTank (via phishing.army) |
| 1    | stix |  1   | MITRE ATT&CK |
| 2    | rss  |  4   | Dark Reading, The Record, SANS ISC, arXiv |
| 2    | json |  1   | PhishTank (active) |
| 2    | csv  |  1   | OpenPhish |
| 4    | csv  |  3   | FireHol, BlockList, ET Bot C2 |
| 5    | rss  |  1   | arXiv cs.AI (research) |

### 3.2 En aktif kaynaklar (son 7g)

| Kaynak               | Calisma | Toplam Item |
|---                   |---      |---         |
| arXiv cs.AI          | 25      | 706        |
| Dark Reading         | 25      | 663        |
| ESET                 | 16      | 650        |
| PhishTank (phishing.army) | 1 | **100.000** |
| URLhaus              | ~       | **400.671** |
| FireHol Level 1      | ~       |   9.000    |

### 3.3 "Dead" isaretli ama gercekten canli olan kaynaklar

| Kaynak      | Onceki status | Cozulen Sorun |
|---          |---             |---            |
| OSV.dev     | dead/unauth   | collect-osv.ts — 6 ekosistemden 49.336 advisory islendi |
| PhishTank   | dead/unauth   | phishing.army fallback — 20.000 phishing domain eklendi |
| MITRE ATT&CK| dead/unauth   | GitHub 429 rate-limit — stal olarak tekrar deniyor |

---

## 4. API ENDPOINTLERI

| Endpoint                              | HTTP | Boyut   | Aciklama |
|---                                    |---   |---      |---       |
| /                                     | 200  | 161 KB  | Ana sayfa (hero + live feed) |
| /feed                                 | 200  | 280 KB  | 50 dokuman/sayfa, facet filtreli |
| /reports                              | 200  |  92 KB  | Mevcut PDF raporlari |
| /actors                               | 200  | 268 KB  | 195 aktor grid + facet |
| /cves                                 | 200  | 154 KB  | CVE kutuphanesi (range/severity/vendor/sort) |
| /iocs                                 | 200  | 169 KB  | 8 tip sekmesi + IOC detay |
| /graph                                | 200  |  12 KB  | STIX actor-teknik grafigi |
| /trends                               | 200  | 214 KB  | PLATFORM GROWTH + sektor x kill chain |
| /ai-threats                           | 200  | 181 KB  | 9 kategori sekmeli |
| /sources                              | 200  | 148 KB  | 7D QUALITY kolonu |
| /stats                                | 200  |  37 KB  | Platform istatistikleri |
| /bookmarks                            | 200  |  11 KB  | localStorage favoriler |
| /feed.xml                             | 200  |  29 KB  | Atom feed |
| /api/v1                               | 200  |  460 B  | API index |
| /api/v1/documents                     | 200  |  13 KB  | Dokuman JSON (100/sayfa) |
| /api/v1/iocs                          | 200  |  11 KB  | IOC JSON |
| /api/v1/cves                          | 200  |  20 KB  | CVE JSON |
| /api/v1/suggest?q=...                 | 200  |  606 B  | Autocomplete (docs/aktor/cve/source/sector) |
| /api/v1/usage                         | 200  |  15 B   | Abuse izleme (15+kebul/5dk IP loglar) |

**Toplam:** 19/19 sayfa + API 200.

---

## 5. SAYFA MIMARILERI

### 5.1 Global ozellikler
- **Container genisligi:** 1400px → 1100px (detay sayfalari), 900px (IOC)
- **Padding:** px-5 md:px-10 lg:px-12 (safe area)
- **Font:** sistem serif + mono, darkmode default
- **Header:** sabit, logo + nav (OVERVIEW / FEED / REPORTS / ACTORS / CVES / IOCS / GRAPH / TRENDS / AI / SOURCES / STATS / BOOKMARKS)

### 5.2 Detay sayfalari ozellikleri (hepsi AA-4 sonrasi)

| Sayfa                | Ozellik |
|---                   |---       |
| /document/[id]       | FULL REPORT + SUMMARY + AI SUMMARY (break-words), MENTIONED IN, RELATED INTELLIGENCE, Kill chain fazi, BookmarkButton |
| /cve/[id]            | CVSS/EPSS/KEV/Publisher grid, MENTIONED IN (with dates), RELATED CVEs, CO-MENTIONED actors (co-occurrence graph), **OBSERVED IOCs** (AA-6), BookmarkButton |
| /actor/[slug]        | Origin/country, FREQUENTLY CO-MENTIONED (8 aktifli), **TECHNIQUES (24+N)** (AA-4), documents, timeline, BookmarkButton |
| /technique/[id]      | Description + actors using it (actors.ttps'ten), documents |
| /ioc/[id]            | Tip-spesifik render (IP: country/ASN/port; URL: related crawler+reporter), INTELLIGENCE grid, related docs |
| /sector/[name]       | Sector timeline + documents + actors |

### 5.3 Feed / arama / filtre
- **FTS:** documents.search_vector (tsvector + GIN index)
- **Facet facets:** ai_category, sector, kill_chain_phase, tech min/max CVSS, source, range (24h/7d/30d)
- **Filter shortcut'lar:** stabil siralama `id DESC` tie-break

### 5.4 Arayuz komponentleri
- BookmarkButton (localStorage, tum detay sayfalarinda ☆☆)
- CopyButton (CVE-ID, IOC, JSON)
- SearchBar (autocomplete, 250ms debounce)
- PageHeader / TwoColumn / SeverityGauge / TLPBadge

---

## 6. OTOMASYON ROADMAP — TAMAMLANAN

### 6.1 Oneri listeleri

| Versiyon | Tarih  | Ogeler | Durum |
|---       |---     |---     |---    |
| Oneri 1  | 14 Agu | 10 (Oneriler) | Tamamlandi |
| Y list   | 14 Agu | 15 (y1-y15)    | Tamamlandi |
| Z serisi | 15 Agu | 12 (z1-z12)    | Tamamlandi |
| AA serisi| 15 Agu | 10 (aa1-aa10)  | Tamamlandi |

### 6.2 Modul listesi

- **Oneri 1 (zenginlestirme):** STIX, fulltext (Wayback), IOC linking (57K), sector sayfalari, public API, FTS arama, gunluk PDF rapor, TR kaynaklar (7), alert webhook
- **Y list (urunlestirme):** alias matching, host-tabanli IOC, teknik sayfalari, full EPSS scan, ts_rank arama, olule feed alarmi, EPSS+KEV, GHSA CVE-first, PhishTank-osv OSV
- **Z serisi (veri genisletme):** Wayback fallback (1700 aday), IOC baglanti 36K->61K, graph_edges 0->3925, fulltext 50%, teknoloji 4628, sektor 1835, dead-feed-alert, daily-stats, EPSS scan
- **AA serisi (urun detay):** EPSS full 165K, KEV refresh, aktor array, CVE range (24h/7d/30d), IOC-CVE bridge, growth chart, source quality, API usage, bookmark, LLM ozet

### 6.3 Guvenlik auditing
- Content XSS/profanity: 567 dokuman entity decode
- Boilerplate strip: 568 dokuman (Cok Okunanlar, share buttons, baslik tekra)
- Duplicate cleaning: 73 alakasiz, 46 source+title dub, 113 GHSA template iyilestirme
- Ikinci temizlik: 57K ios, 9K teknik baglanti, 36K edge
- **Content hygiene:** HTML numeric + named entity decode (TR chars), 250+ alakasiz haber filtre (futbol, borsa, magazin, tarim)

---

## 7. GUVENLIK & COMPLIANCE

- **Auth:** Kural K4 geregi yok (public access). admin /api/v1/* istege bagli
- **Cloudflare:** Zone 0rce-Labs, rate limit 300 req/10s (Cloudflare rule)
- **No-CMS:** Dogrudan Next.js server (no admin panel security risk)
- **TLS:** Let's Encrypt + Cloudflare proxy (CF + edge)
- **Data sources:** Ham 3-party feed (no user PII, no ACME)
- **PHI/PII:** 100% public-advisory data
- **Backups:** systemd timer threats-backup.timer 03:17 UTC, daily threats-YEAR-MM-DD.tar.gz

---

## 8. SON YAPILAN BUYUK GUNCELLEMELER (15-17 Agustos 2026)

### 8.1 OSV.dev entegrasyonu (en son buyuk is)
- 5 ekosistem: PyPI, crates.io, Go, NuGet, OSS-Fuzz, Maven = **49.336 advisory → +29.752 CVE**
- Streaming download (Node fetch body pipe) — buyuk dosyalar memory dostu
- bucket indeks NPM yok — yalnizca PyPI, crates.io, Go, NuGet, OSS-Fuzz, Maven destekleniyor

### 8.2 7 kat buyume (bakildi)
- CVE kutuphanesi: 1252 (14 Agu) → 165K (15 Agu) → 175.207 (17 Agu) = **140x**
- IOC: 272K → 525K = **1.9x** (PhishTank-phishing.army ile)
- Dokuman: 2.869 → 14.307 = **5x** (package_vulns backlog)
- Aktor: 150 → 195 = 1.3x (yeni teknik iliskili)

### 8.3 Detay sayfa tasarim iyilestirmesi
- 1100px container (1400'ten)
- EntityChip + sidebar + content block (tek-alan tasarim yerine 2 col)
- FULL REPORT + SUMMARY + AI SUMMARY break-words
- OBSERVED IOCs bolumu (CVE detayinda)
- 12 detay sayfasinin tamaminda BookmarkButton + CopyButton

### 8.4 Feed duplicate onlemi
- GHSA template baslik duzeltmesi ("In the Linux kernel..." [CVE-2026-XXXXX])
- 274 baslik donusumu (113 kernel + 169 IBM/Dell)
- IBM Db2 + Dell Wyse gibi template on ekleri
- Linux gibi source+title ayni olan 46 alakasiz kayit

### 8.5 Haber icerik hijyeni
- HTML entity decode (numeric + named): 567 dokuman
- Boilerplate strip: 568 dokuman
- Topic filter (siber / hack / etc.): 73 haber dislandi
- Yapay Zeka Sozlugu gibi: TR-TR kaynak ile konu filtresi birlikte

---

## 9. AI ENTEGRASYONLARI

### 9.1 Aktif AI beslemeleri
- **Lakera/HiddenLayer** (blog): AI red-team haberleri
- **arXiv cs.AI / cs.LG / cs.CR**: Arastirma yayinlari
- **MITRE ATLAS**: AI saldiri matrisleri (STIX)
- **Anthropic/OpenAI GPT/Claude**: AI vendor bloglari (vendor sec)
- **AI Incident DB**, **PromptArmor**, **HuggingFace Advisories**: pasif (auth gerekli veya dead)
- **ai_threats** tablosu: 31.828 kategori haritalandirma

### 9.2 Gelecekte aktiflestirilebilir
- OSV API ile per-tag bulk (npm'de calisacak format)
- AUTOMATIC incident-to-IOC dedup (link-iocs.ts ile zaten)

---

## 10. GECMISTEN PERFORMANS OZETI

| Tarih      | Buyume/Kazanm     |
|---         |---               |
| 14 Agu     | 1252 CVE, 2.869 dok, 195 aktor → MVP |
| 14 Agu aks| 165K CVE (NVD backfill, 100x)  |
| 15 Agu sbt| 168K CVE (EPSS full, +3K), 272K IOC (4x) |
| 15 Agu ogle| 175K CVE (OSV backfill), 525K IOC, 14K dok (5x), AA1-10, layout fix, duplicate fix |
| 16 Agu     | Detail page layout safe area + Y5 PDF grafikler |
| 17 Agu     | Healthcheck (IPv6) fix, fulltext progress, OSV streaming |

**One cikarilacak ders:**
- Tum buyuk isler (backfill, enrichment, content hygiene, duplicate cleanup) "dokuman/saat" rate'iyle maksimum throughput hedefleyerek script'ler ile yapildi
- 4 major orchestration collector + 6 enrichment collector + 14 maintenance collector
- 19/19 endpoint 200, 4/4 container healthy

---

## 11. KALAN GOREVLER & KATEGORIK NOTLAR

### 11.1 Bilinen kalintilar
- **TR kaynak toplama:** Koleksiyon TH'snde container Turkey feed dahil ama alanakaldigi TR kaynak coigin net degil (collector to-fe alaninda TR normalize diger 4-5 kaynak icin). 15 TR kaynak DB'de tanimli, sadece 4 (AA, Dunya, Webrazzi, ShiftDelete) aktif
- **npm/Debian/Ubuntu/Maven OSV:** NDJSON partitioned format desteklemiyor — v2 ozellik (restful API ile)
- **MITRE ATT&CK STIX:** GitHub rate limit nedeniyle stal — otomatik denemeler mevcut
- **Stack karsit ekleme (Stack Overflow, Exploit-DB):** disabled — tekrar valid edilebilir

### 11.2 Olceklenebilirlik
- DB ~510MB, hizli buyum yok (gunluk +20CVE, +500 dok)
- Container memory catisi (worker 256MB) — buyuk container'lar OSV streaming ile cozuldu
- Cloudflare rate limit 300/10s — yeterli marj var

### 11.3 Onerilen gelistirmeler
1. **OSV API entegrasyonu** (npm, Maven, Debian, Ubuntu) — partitioned format destegi
2. **AI-powered ozet katmani** — llm-summary.ts zaten calisiyor (key eksik), OpenAI yapilandirilabilir
3. **MISP push** — push-misp.ts zaten hazir, key girilebilir
4. **E-mail bulten** — email-newsletter.ts hazir, SMTP bilgi girilebilir
5. **GHSA contributor tablosu** — GHSA kaynagi icin kimler modelleme yapti bilgisi
6. **Yara kurallari** — kill chain bazli Yara-Sigma uretebilir

---

## 12. HOSTING & INFRA DETAY

| Container | IP:Port (external) | Image | Restart |
|---        |---                 |---    |---      |
| threats-app | 127.0.0.1:27100->3000 | threats-app:latest (Next.js) | unless-stopped |
| threats-worker | (internal 3000) | threats-app:latest | unless-stopped |
| threats-postgres | (internal 5432) | postgres:16-alpine | unless-stopped |
| threats-redis | (internal 6379) | redis:7-alpine | unless-stopped |

**Tunnel:** Cloudflare tunnel `homokomokomorae-leaders-tooled.0rce-Labs.com -> http://127.0.0.1:27100` (statik hostname)  
**Topoloji:** Tek VM (Oracle Always Free ARM), 4 container, 145GB disk, 24GB RAM.

---

## 13. SAHIP BILGILERI & LINKLER

- **Operator:** Samet Yilmaz Temel (operator@0rce-Labs.com)
- **Repository:** github.com/0rce-Labs/threats-ror (private)
- **Canli URL:** https://threats.0rce.com
- **Product vision:** Uzun vadeli gercek CTI platformu (bu session devam eden buyuk guncellerlerle)

---
