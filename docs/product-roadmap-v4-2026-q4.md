# threats.0rce.com — Geliştirme Önerileri Listesi v4 (AA Serisi)

**Tarih:** 15 Ağustos 2026 · **Önceki:** Ö1-Ö10 ✅ + Y1-Y15 ✅ + Z1-Z12 ✅

---

## MEVCUT DURUM (v4 öncesi canlı ölçümler)

| Katman | Değer | Durum |
|---|---|---|
| Doküman | 2.869 | ✅ |
| CVE kütüphanesi | **165.799** | ✅ (2022→bugün) |
| └ EPSS'li | **1.248 (%0.75)** | 🔴 KRİTİK BOŞLUK |
| └ KEV'li | 128 | 🟡 az |
| IOC | 272.576 | ✅ |
| └ doküman bağlantısı | 57.732 | 🟡 |
| Aktör | 195 (8831 bağlantı) | 🟡 |
| Teknik | 863 (2176 doküman) | ✅ |
| AI tehdit kaydı | 9.593 | ✅ |
| graph_edges | 3.925 | ✅ |
| Fulltext ≥200 kelime | **864/2.869 (%30)** | 🟡 |
| <100 kelime doküman | **1.765 (%61)** | 🟡 |
| Aktörlü doküman | **483 (%17)** | 🟡 |
| daily_stats | 1 gün | 🟢 yeni |
| source_history | 468 kayıt | ✅ |
| Aktif kaynak | 46 (15 TR / 62 EN) | ✅ |

---

## ÖNERİLER (öncelik sırasıyla)

### AA-1: EPSS tüm kütüphaneye yay (P0 — en kritik boşluk)
**Sorun:** 165.799 CVE'nin sadece 1.248'inde (%0.75) EPSS var. Risk sıralaması
(sort=risk) şu an pratikte sadece o 1.248 CVE üzerinde çalışıyor.
**Çözüm:** enrich-epss-kev chunk 100'ü koru ama full tarama modu ekle:
`EPSS_FULL_SCAN=1` env'i ile tüm EPSS'siz CVE'leri tara (~1.658 istek ≈ 25-30 dk,
arka planda). Worker'da haftalık full tarama + günlük delta.
**Etki:** Risk sıralaması tüm kütüphanede çalışır; /cves üst sıraları gerçek
istismar olasılığına göre dolar.

### AA-2: KEV günlük tazeleme (P1)
**Sorun:** CISA KEV listesi günlük değişiyor (1665 CVE), bizde 128 işaretli.
**Çözüm:** KEV fetch'i collect.sh'te zaten var — `in_kev=false` olanları da
günlük temizle (KEV'den çıkanları false'la). Böylece KEV rozetleri güncel.

### AA-3: Z1 fulltext'i kalıcı bitir (P1)
**Sorun:** Wayback fallback backfill'i worker restart'ta öldü — 1.765 doküman
hâlâ <100 kelime (%61).
**Çözüm:** fetch-fulltext'i collect.sh'e **bounded batch** olarak ekle:
her koşuda max 150 doküman (dakikada ~15 istek → 10 dk). Idempotent —
kalanlar birkaç koşuda biter. `/tmp` log'a değil, DB'de `last_fulltext_attempt`
kolonuna durum yaz ki restart'ta nerede kaldığını bilsin.

### AA-4: Aktör kapsamı %17 → %50 (P1)
**Sorun:** 2.869 dokümanın sadece 483'ünde aktör var. Teknik eşleştirme
(9245 bağlantı, conf 0.4) ekledik ama actors array'i güncellenmiyor.
**Çözüm:** link-actors'a "teknik ilişkili aktörü actors array'ine ekle (conf≥0.6
ise)" adımı — array'e eklenenler doküman detayında ve aktör sayfasında görünür.
Ayrıca co-mention zinciri: aktör A ile birlikte geçen B'yi de öner (1. derece).

### AA-5: CVE sayfası "yeni gelenler" filtre sekmesi (P1)
**Değer:** 165K CVE'de arama güçlü ama "bugün yayınlananlar" keşfi zayıf.
**Çözüm:** /cves'e `range=24h|7d|30d|all` hızlı filtre + "NEW THIS WEEK" rozeti
(sort=date ile birleşince haber akışı hissi verir — kullanıcının istediği).

### AA-6: IOC → CVE köprü (P2)
**Sorun:** IOC'ler dokümanlara bağlı ama CVE'lere değil. Saldırı IP'si ↔ CVE
ilişkisi yok.
**Çözüm:** document_iocs üzerinden: CVE'li dokümanın IOC'leri → o CVE'nin
detay sayfasında "OBSERVED IOCs" bölümü. Tek sorgu, büyük değer.

### AA-7: daily_stats'i 30 güne doldur + /trends'e büyüme grafiği (P2)
**Durum:** daily_stats 1 gün. 30 gün sonra anlamlı trend başlar.
**Çözüm:** Beklemek yerine geçmişten backfill: documents.fetched_at
gruplarından son 60 günün sentetik snapshot'larını üret (sadece tarihsel
count'lar — veri mevcut). /trends'e "PLATFORM GROWTH" alanı.

### AA-8: Kaynak kalite skoru (P2)
**Sorun:** 46 aktif kaynak var ama hepsi eşit görünüyor. Kimi günde 50 haber
getiriyor, kimi 1.
**Çözüm:** source_history'dan (468 kayıt) her kaynağın 7 günlük ortalama
üretkenlik + hata oranı → /sources sayfasında kalite göstergesi. Düşük
üretken kaynaklar için "zayıf" etiketi.

### AA-9: AI özetleri doküman detayına "ikinci görüş" olarak (P2)
**Durum:** ai_summary 9.593 kayıt var ama tablo adı farklı çıktı (ai_threats'te
mi birleşik?) — kontrol edilip UI'da AI SUMMARY bölümüyle birleştirilecek.

### AA-10: Public API'ye API key + rate limit katmanı (P2)
**Durum:** /api/v1 açık (K4 gereği). Ama otomasyon kötüye kullanabilir.
**Çözüm:** CF rate limit zaten var (300/10s) — IP bazlı abuse tespiti logu
(5 dk'da 500+ istek) ekleyip rapor PDF'ine "API KULLANIMI" bölümü.

---

## ÖNERİLEN SIRA
AA-1 → AA-3 → AA-2 → AA-4 → AA-5 → AA-6 → AA-7 → AA-8 → AA-10 → AA-9

## HIZLI KAZANIMLAR
AA-5 (UI filtresi, 5 dk) · AA-6 (tek sorgu) · AA-2 (script güncelleme)
