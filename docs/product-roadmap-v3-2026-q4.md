# threats.0rce.com — Geliştirme Önerileri Listesi v3 (Z Serisi)

**Tarih:** 15 Ağustos 2026 · **Önceki:** Ö1-Ö10 (tamamlandı) + Y1-Y15 (tamamlandı)

---

## MEVCUT DURUM (v3 öncesi ölçümler)

| Katman | Değer |
|---|---|
| Doküman | 2.800 |
| IOC | 221.507 |
| CVE zenginleştirme | 1.252 (1.248 EPSS, 128 KEV) |
| Aktör | 195 (172'si TTP'li) |
| Teknik | 863 |
| AI threat | 9.097 |
| Kill chain atanmış | 2.261 (%81) |
| Kaynak | 44 aktif (5 TR) |
| Sayfa/API | 19 route 200 + /api/v1 + /feed.xml + export |

## VERİ KALİTESİ GAP'LERİ (ölçüldü)

| Gap | Değer | Oran |
|---|---|---|
| Doküman < 100 kelime | 1.710 | %61 |
| IOC'suz doküman | 2.562 | %91 |
| Aktörsüz doküman | 2.313 | %83 |
| Kill chain'siz | 539 | %19 |
| **graph_edges** | **0** | — |

---

## ÖNERİLER

### P0 — Veri Derinliği

**Z1 · Doküman başına tam içerik kapsamı (%61 → %95)**
1.710 doküman < 100 kelime. fetch-fulltext tüm geçmişe açıldı ama hâlâ %61 kısa.
- Yapılacak: 100 kelimenin altındaki dokümanları sırayla işle; 404/403 kısıtlı siteler için Wayback Machine (`web.archive.org/cdx`) fallback'i ekle
- Etki: arama kalitesi + kalite skoru + benzerlik önerileri doğrudan iyileşir

**Z2 · IOC-doküman kapsamı (%9 → %60+)**
221K IOC'nin sadece ~235 dokümanı IOC'li. IOC'ler dokümana bağlanmadan "ölü" duruyor.
- Yapılacak: link-iocs'u genişlet — doküman başına regex ile IP/domain/URL çıkar (yapıldı) → kalan: IOC değerlerini **hash** ve **c2_ip** tipleri dahil et; ayrıca her yeni dokümanda otomatik çalıştır
- Etki: IOC'ler keşfedilebilir olur (doküman sayfasından IOC'ye, IOC'den dokümana)

**Z3 · graph_edges doldur (0 → gerçek grafik)**
/graph sayfası var ama edges tablosu BOŞ — aktör↔teknik↔sektör ağı render edilemiyor olabilir.
- Yapılacak: Y3'te kazanılan 4.628 aktör-teknik ilişkisini graph_edges'e yaz; aktör-aktör co-mention'ları (Y9) + sektör bağlantılarını ekle
- Etki: /graph'ı gerçek bir CTI ağ görselleştirmesi yapar (büyük demografik etki)

### P1 — Ürün Derinliği

**Z4 · CVE↔doküman bağlantısı derinleştirme**
1.252 CVE zenginleştirilmiş ama dokümanlarda CVE geçme tespiti zayıf (1125 doküman "cve'li" ama çoğu tekrarlayan).
- Yapılacak: doküman içeriklerinde CVE ID regex'i ile taze eşleştirme (CVE-YYYY-NNNNN), hem documents.cves hem document_cves junction
- Etki: her CVE sayfasında gerçek haberler listelenir

**Z5 · Aktör eşleştirme genişletme (%17 → %50+)**
2.313 doküman aktörsüz. Y1 aliases eşleştirme yapıldı ama kapsam düşük.
- Yapılacak: (a) teknik ilişkili aktör eşleştirme (dokümanda T1190 geçiyorsa o tekniği kullanan aktörleri öneri olarak ekle, kesin değil), (b) ülke/coğrafya kelime eşleştirme
- Dikkat: yanlış pozitif riski — "ilişkili olabilir" olarak işaretle

**Z6 · Sektör eşleştirme otomasyonu**
Sektör etiketleri elle/backfill ile — dokümanların sadece ~1.047 sektör etiketi var.
- Yapılacak: sektör keyword sözlüğü (finance: bank, payment, SWIFT; healthcare: HIPAA, hospital, patient...), backfill'e ekle
- Etki: /sector sayfaları + sektör×kill chain matrisi zenginleşir

### P2 — Dağıtım / Erişim

**Z7 · MISP/OpenCTI export entegrasyonu (gerçek)**
/api/v1/export hazır ama tek yönlü dosya. Gerçek CTI akışı için:
- Yapılacak: MISP REST API'ye push (auth key), OpenCTI API entegrasyonu; STIX bundle'ı haftalık otomatik üret
- Etki: platform diğer CTI araçlarıyla konuşur — "kaynak" statüsü güçlenir

**Z8 · USOM entegrasyonu (resmi TR kaynak)**
USOM API erişilemez çıktı (HTML challenge). Alternatif:
- Yapılacak: USOM web arayüzünü düzenli tarama (rate-limit'e dikkat) veya USOM'un e-posta bültenine abone olup parse; TR-CERT ile iletişime geçme notu
- Etki: TR kurumsal kaynak — ulusal siber güvenlik otoritesi

**Z9 · Arama API'si + autocomplete**
/api/v1/documents arama destekliyor ama autocomplete yok.
- Yapılacak: /api/v1/suggest endpoint (title prefix, tsvector trigram), feed arama kutusuna canlı öneri
- Etki: kullanıcı deneyimi + API tüketicileri için hızlı keşif

### P3 — Uzun Dönem

**Z10 · Gerçek LLM özetleme katmanı**
AI summary deterministik (ilk cümle + entity digest). LLM ile değiştirilebilir ama maliyet/akademik dürüstlük dengesi gerek.
- Yapılacak: isteğe bağlı LLM özet (kendi endpoint'i veya açık model), deterministik fallback korunur
- Etki: doküman kalitesi üst seviyeye çıkar

**Z11 · Zaman serisi veritabanı / trend saklama**
Şu an trendler anlık sorgu. Günlük snapshot saklanırsa:
- Yapılacak: daily_stats tablosu (her günün doküman/IOC/CVE/aktör sayıları), 30/90 günlük karşılaştırma grafikleri
- Etki: gerçek trend analizi + haftalık raporlarda tarihsel karşılaştırma

**Z12 · Çoklu dil arayüz (TR/EN)**
İçerik TR+EN karışık ama arayüz EN. TR kullanıcılar için:
- Yapılacak: i18n (next-intl), TR arayüz + TR içerik filtreleme (dil=tr)
- Etki: TR güvenlik topluluğuna erişim

---

## ÖNERİLEN UYGULAMA SIRASI

Z1 → Z2 → Z3 → Z5 → Z6 → Z4 → Z8 → Z7 → Z9 → Z11 → Z10 → Z12

**Neden bu sıra?** Z1-Z3 veri derinliğini (ürünün özü) tamamlar; Z5/Z6 etiketleme kapsamını artırır; Z4 CVE bağlantısını derinleştirir; sonra dağıtım (Z7-Z9) ve uzun dönem (Z10-Z12) gelir.

## HIZLI KAZANIMLAR (yarım gün)

- Z3: graph_edges tek sorguyla dolar (4.628 ilişki hazır)
- Z4: CVE regex eşleştirme tek script
- Z6: sektör sözlüğü + backfill adımı
