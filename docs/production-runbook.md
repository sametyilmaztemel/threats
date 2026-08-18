# Production Smoke / Audit Runbook — threats.0rce.com

Bu doküman, daha önce düzeltilen veri, cache, CSP, nonce ve SEO sorunlarının production'da
tekrar oluşmasını otomatik tespit eden READ-ONLY test altyapısını açıklar.

## Amaç

- Okuyucuya production davranışını HİÇ değiştirmeden, sadece HTTP GET ile doğrula.
- DB'ye yazma, migration, backfill, deploy YOK.
- Daha önce çözülmüş regresyonların (github.com IOC, Live Feed tarihi, Earth Lusca=1,
  Conti=4, 18/18 kaynak, CSP nonce, edge cache HIT, canonical/OG) bozulup bozulmadığını izle.
- GitHub Actions ile 30 dakikada bir hızlı smoke, günde bir kez ağır audit.

## Dosyalar

| Dosya | Rol |
|---|---|
| `scripts/production-smoke.mjs` | Ana test script'i (Node built-in fetch/assert, bağımlılık yok) |
| `scripts/lib/parsers.mjs` | Saf/import edilebilir HTML/header parser'ları (birim testli) |
| `test/production-smoke.test.mjs` | Parser birim testleri (`node --test`) |
| `.github/workflows/production-smoke.yml` | 30dk smoke + günlük audit CI |
| `package.json` | npm script tanımları (smoke:production / audit:production / test:parser) |

## Local çalıştırma

```bash
# Production hızlı smoke
node scripts/production-smoke.mjs
# veya
npm run smoke:production

# Ağır/günlük audit (tüm sitemap shard URL örnekleri)
node scripts/production-smoke.mjs --audit
npm run audit:production

# Parser birim testleri
node --test test/production-smoke.test.mjs
npm run test:parser

# Farklı ortam (staging/local)
BASE_URL=https://staging.threats.0rce.com node scripts/production-smoke.mjs
```

## PASS / FAIL / WARN anlamları

- **PASS**: zorunlu koşul sağlandı.
- **FAIL**: zorunlu regresyon-önleyici koşul bozuldu → process exit 1, CI kırmalı.
- **WARN**: performans eşikleri (HIT cfWorker > 250ms, MISS total > 8s). İlk aşamada build'i
  KIRMAZ; yalnız uyarır. 20s üstü ise timeout = FAIL.

## Sabit invariant vs repository variable

Exact sayaç değerlerini kör sabit kabul etmek yanlış pozitife yol açar. İki katman:

**Sabit invariant (env gerektirmez, her zaman çalışır):**
- AI threats: geçerli pozitif integer + ani düşüş/makul olmayan sıçrama WARN'ı.
- Sources: active/healthy integer + `healthy <= active` (healthy < active ise operasyon alarmı).
- Sitemap: gerekli kategoriler (`static/cves-/actors-/documents-`) bulunmalı, her shard
  en fazla 50.000 URL, duplicate yok, her shard HTTP 200.

**Repository variable (yalnız env açıkça tanımlıysa exact kontrol edilir):**
Exact değer değiştiğinde (legit veri artışı) sadece env'i güncelle — testi kapatma.
Bu değerler CI'da repository variable olarak da set edilebilir.

| Env | Açıklama |
|---|---|
| `BASE_URL` | Test hedefi (varsayılan https://threats.0rce.com) |
| `EXPECTED_ACTIVE_SOURCES` | Tanımlıysa exact active kontrolü (yoksa invariant) |
| `EXPECTED_HEALTHY_SOURCES` | Tanımlıysa exact healthy kontrolü |
| `EXPECTED_AI_THREATS` | Tanımlıysa exact AI toplamı (yoksa pozitif-int invariant) |
| `EXPECTED_SITEMAP_TOTAL` | Tanımlıysa audit'te exact toplam URL kontrolü |
| `EXPECTED_EARTH_LUSCA` | Exact regresyon (varsayılan 1) — false-positive koruması |
| `EXPECTED_CONTI` | Exact regresyon (varsayılan 4) — false-positive koruması |

`EXPECTED_EARTH_LUSCA=1` ve `EXPECTED_CONTI=4` kasıtlı exact'tir: aktör ilişki sayaçlarında
yanlış eşleşme (Earth Lusca 4255-1 gibi) ciddi bir regresyondur ve sabit beklenir.

**Meşru veri artışında nasıl güncellenir:**
1. FAIL gerçek bir regresyon mu, yoksa legit büyüme mi olduğunu doğrula (akademik dürüstlük,
   kaynak/veri gerçekten arttı mı).
2. Legit ise ilgili `EXPECTED_*` env'in güncel değerini CI repository variable'da set et
   (yeni değer aşırı uç değilse).
3. İnvariant katmanı (pozitif int, healthy<=active, <=50K shard) zaten legit büyümeye toleranslı.
4. Değilse (tutarsız/örnek dışı artış) kök nedeni çöz — testi kapatma.

## Bir test bozulduğunda kontrol sırası

1. `production-smoke.mjs` çıktısındaki FAIL satırını oku (hangi koşul, hangi route).
2. İlgili route'a curl ile manuel bak:
   ```bash
   curl -sSI -H 'Accept: text/html,application/xhtml+xml' -A 'Mozilla/5.0' https://threats.0rce.com/<path>
   ```
3. Cache/CSP ise: Worker/CF ayarlarını kontrol et (aşağıdaki rollback & purge).
4. Veri ise: `source_map`'e yeni veri eklendi mi? Eğer legit ise env override et;
   değilse kök nedeni çöz (testi kapatma).
5. Kök neden çözüldükten sonra smoke'u yeniden çalıştır, PASS doğrula.

## Worker rollback

CSP nonce Worker'ını production'dan kaldırmak için (acil durum):

```bash
bash workers/rollback-csp-nonce.sh
```
(route'u siler + purge + sanity. Worker yedeği `workers/backup/` içinde.)

## Cache purge ve nonce kontrol

```bash
# CF Cache Rules + purge (zone API)
# Worker cache'i (Cache API) purge etmek: TTL 60s kendi expire eder; gerek yoksa:
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE>/purge_cache" \
  -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_GLOBAL_KEY" -H 'Content-Type: application/json' \
  -d '{"purge_everything":true}'

# Nonce doğrula (iki response farklı nonce)
curl -sS -D - -o /dev/null -H 'Accept: text/html,application/xhtml+xml' -A 'Mozilla/5.0' https://threats.0rce.com/ | grep -i content-security-policy
```

## Yanlış pozitiflerde testi kapatmak yerine kök nedeni çözme kuralı

- Test FAIL veriyorsa önce gerçekten regresyon mu, yoksa env sayacı değişikliği mi olduğunu ayırt et.
- Legit veri büyümesiyse **env variable'ı güncelle** (ör. kaynak sayısı 18→20).
- Gerçek regresyonsa **testi devre dışı bırakma, kök nedeni çöz**. Test, tekrar oluşmaması için ORADA kalır.
- Performans WARN'ları eşik ayarlamasıyla susturulabilir; FAIL'lar asla komple kapatma yerine kök nedenle çözülür.
