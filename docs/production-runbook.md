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
| `.github/workflows/production-smoke.yml` | 30dk smoke + günlük audit CI |
| `package.json` | npm script tanımları |

## Local çalıştırma

```bash
# Production hızlı smoke
node scripts/production-smoke.mjs
# veya
npm run smoke:production

# Ağır/günlük audit (tüm sitemap shard URL örnekleri)
node scripts/production-smoke.mjs --audit
npm run audit:production

# Farklı ortam (staging/local)
BASE_URL=https://staging.threats.0rce.com node scripts/production-smoke.mjs
```

## PASS / FAIL / WARN anlamları

- **PASS**: zorunlu koşul sağlandı.
- **FAIL**: zorunlu regresyon-önleyici koşul bozuldu → process exit 1, CI kırmalı.
- **WARN**: performans eşikleri (HIT cfWorker > 250ms, MISS total > 8s). İlk aşamada build'i
  KIRMAZ; yalnız uyarır. 20s üstü ise timeout = FAIL.

## Beklenen sayaç environment variable'ları

Exact değerler zamanla değişebilir (yeni kaynak, yeni AI tehdit, yeni doküman). Kodda
hardcode'lamak yanlış pozitiflere yol açar; bu yüzden environment variable ile override edilir.

| Env | Varsayılan | Açıklama |
|---|---|---|
| `BASE_URL` | `https://threats.0rce.com` | Test hedefi |
| `EXPECTED_ACTIVE_SOURCES` | `18` | /sources aktif kaynak sayısı |
| `EXPECTED_HEALTHY_SOURCES` | `18` | /sources healthy sayısı |
| `EXPECTED_AI_THREATS` | `349` | /ai-threats toplamı |
| `EXPECTED_EARTH_LUSCA` | `1` | actor/Earth Lusca doc sayısı |
| `EXPECTED_CONTI` | `4` | actor/Conti doc sayısı |

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
