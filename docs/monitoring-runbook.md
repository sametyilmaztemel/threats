# Monitoring Runbook — threats.0rce.com

Aşama 2: uptime, ingestion, Worker/Tunnel ve veri kalitesi alarm altyapısı.
Amaç: Aşama 1 testleri sadece hatayı tespitle kalmasın; production problemi oluştuğunda
tekrar spam üretmeden alarm göndersin, düzelince recovery bildirimi üretsin.

## Alarm severity tanımları

| Severity | Örnekler | Eşik (ardışık) | Cooldown |
|---|---|---|---|
| **critical** | ana sayfa 200 değil, health/live/ready 503/404 değil, CSP nonce yok, unsafe-inline geri döndü, header/body nonce uyuşmuyor, origin guard 200 vermiş, 5xx, github IOC geri geldi | 2 | 30 dk |
| **warning** | ingestion stale (>480 dakika / 8 saat), active != healthy, worker feed cache HIT değil, HIT cfWorker >250ms, MISS total >8s, AI/IOC sıçrama-düşüş, sitemap shard ulaşılmıyor, canonical/OG kayboldu | 2 | 30 dk |
| **info** | recovery (düzelme), BUILD_ID değişimi, kaynak 18/18 veya active==healthy dönüşü | — | — |

İlk gözlem her zaman **baseline** — alarm ÜRETMEZ (geçmiş yokken yanlış alarm atılmaz).

## Alarm state / cooldown

State path:
- Production: `/var/lib/threats-monitor/state.json`
- Dry-run: `./.runtime/threats-monitor-state.json` (yazılmaz)

Kurallar:
- Atomic yazım: tmp + rename.
- Lock: `state.lock` dosyası (`O_EXCL`) — paralel ikinci process çıkar.
- Aynı check ID + env + target aynı fingerprint → aynı alarm tekrar üretilmez (cooldown 30dk).
- Durum normale dönünce bir kez RECOVERY bildirimi.
- State bozuk/silindiyse güvenli yeniden oluşturulur (sanitize), monitor çökmez.

Fingerprint: `sha256(checkId|environment|target)[:24]`

## Her alarmda ilk kontrol

1. **home_http / health_live / health_ready 404/503** — uygulama deploy edildi mi? `.next/BUILD_ID`
   değişmiş olabilir; `/api/health/*` henüz yoksa deploy gerekiyor.
2. **CSP nonce yok / unsafe-inline geri döndü** — Worker `csp-nonce-worker` ayakta mı? Rollback:
   ```bash
   bash workers/rollback-csp-nonce.sh
   ```
3. **Origin guard 200 (secret'siz erişim)** — GÜVENLİK: middleware X-Origin-Auth koruması bozuldu;
   hemen `origin-threats.0rce.com`'u placeholder'a çevir + middleware'i onar (Aşama 2 revize).
4. **github IOC / academik veri regresyonu** — collector yeniden eklendi mi? `source_map`/link-iocs
   filtresini kontrol et; `classification='mentioned'` dışı github IOC engellenmiş olmalı.

## False positive değerlendirme

- Alarm başlamadan önce gerçekten sorun mu, yoksa env sayacı/beklenen değişim mi?
- Legit veri artışı (yeni kaynak/AI tehdit) → `EXPECTED_*` env'i repo variable'da güncelle (testi kapatma).
- Monitör ilk koşusuysa baseline → alarm yok, env doğru set edildiğinden emin ol.

## Worker rollback

```bash
bash workers/rollback-csp-nonce.sh   # threats.0rce.com route'unu kaldırır + purge
```
Worker yedeği `workers/backup/`. Rollback sonrası nonce/edge cache eski çalışana döner.

## Tunnel kontrol komutları

```bash
systemctl is-active cloudflared                   # active olmalı
journalctl -u cloudflared --since "10 min ago" --no-pager | tail -50
# ingress doğrulama
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://threats.0rce.com/
# local app health (tunnel arkası)
curl -sS -H 'Host: threats.0rce.com' http://127.0.0.1:27100/ -o /dev/null -w '%{http_code}\n'
```

## Ingestion restart prosedürü

Collector worker container içinde `while true; collect.sh; sleep 21600` loop'unda çalışır:
```bash
sudo docker restart threats-worker
# veya el ile koş
sudo docker exec threats-worker sh /scripts/collect.sh
```
Son başarılı ingestion: `/api/health/ready` → `checks.ingestion` (ok/stale) veya DB:
```sql
SELECT MAX(last_fetched_at) FROM sources;
```

## State/cooldown sıfırlama

```bash
sudo rm -f /var/lib/threats-monitor/state.json /var/lib/threats-monitor/state.lock
# monitor bir sonraki koşuda fresh baseline'dan başlar
```

## Webhook secret rotation

- `ALERT_WEBHOOK_URL` aynı zamanda server/CI için: `/etc/threats-monitor.env` + CI repo secret
  `ALERT_WEBHOOK_URL`/`ALERT_WEBHOOK_TYPE`. Secret'ı WEBHOOK yoksa **asla loglama**; url içindeki
  token redact edilir (monitor `redact()` ile maskeler).
- Rotation: webhook provider'da yeni url üret → `/etc/threats-monitor.env` + CI secret güncelle →
  `sudo systemctl daemon-reload` → test (`--dry-run` ile payload gör).

## Recovery doğrulama

Alarm sonrası düzelme: `checks.ingestion` ok, `home_http` 200, `csp_nonce` pass → monitor bir kez
RECOVERY bildirir. `node scripts/production-monitor.mjs --dry-run` ile doğrula.

## Ingestion staleness eşikleri (dakika)

Collector ~360 dakikada/6 saatte bir tur atar. Eşikler collector gerçek çalışma süresine göre güvenli toleransla seçildi:

- `INGESTION_WARNING_MINUTES=480` (480 dakika / 8 saat = 1.33 tur) — degraded/warning
- `INGESTION_CRITICAL_MINUTES=840` (840 dakika / 14 saat = 2.33 tur) — critical

Bu eşikler 1 turu tolere eder (warning), 2 tam tur kaçırıldığında critical olur.

Uygulama (`app/src/app/api/health/ready/route.ts`) aynı eşikleri okur; `/api/health/ready` response `status` alanı `ok | degraded | critical | down` döner ve `checks.ingestion` alanı `ok | warning | critical | invalid` döner.

## Readiness semantiği (runbook kararı)

`/api/health/ready` HTTP kodu:

| Koşul | status | HTTP | Neden |
|---|---|---|---|
| DB erişilemiyorsa | `down` | 503 | zorunlu bağımlılık, uygulama çalışamaz |
| Ingestion warning veya source mismatch | `degraded` | 200 | uygulama eski veriyle çalışıyor; gereksiz restart döngüsü yok |
| Ingestion critical | `critical` | 200 (varsayılan) | ürün kararı: eski veri kabul edilemez değilse `INGEST_CRITICAL_AS_DOWN=1` env ile 503 |
| Ingestion invalid timestamp | `degraded` | 200 | DB parse hatası; güvenli degraded, down değil |
| Hepsi ok | `ok` | 200 | normal |

**Karar:** default 200/degraded (collector bir-iki tur kaçırsa restart etmeyiz). `INGEST_CRITICAL_AS_DOWN=1` set edilirse 14 saatten eski ingestion'da 503 (load balancer uygulamayı devre dışı bırakır). Üretimde varsayılan 200 tercih edilir.

## Monitor tamamen çökerse manuel kontrol

```bash
# 1. Uygulama ayakta mı (Web)
curl -sS -o /dev/null -w '%{http_code}\n' https://threats.0rce.com/            # 200
curl -sS https://threats.0rce.com/api/health/live                             # ok
# 2. Tunnel
systemctl is-active cloudflared                                                # active
# 3. DB
sudo docker exec threats-postgres psql -U threats -d threats -t -c 'SELECT 1'
# 4. Ingestion
sudo docker exec threats-postgres psql -U threats -d threats -t -c 'SELECT MAX(last_fetched_at) FROM sources;'
# 5. Disk
df -h /
```

## systemd install / enable / disable / rollback

```bash
# install (kopya + daemon-reload)
sudo cp ops/systemd/threats-monitor.service ops/systemd/threats-monitor.timer /etc/systemd/system/
sudo systemctl daemon-reload

# etkinleştirme (üretimde ÖNCE dry-run + PR review)
sudo systemctl enable --now threats-monitor.timer

# disable
sudo systemctl disable --now threats-monitor.timer

# rollback (kaldır)
sudo systemctl disable --now threats-monitor.timer
sudo rm /etc/systemd/system/threats-monitor.service /etc/systemd/system/threats-monitor.timer
sudo systemctl daemon-reload

# loglar
sudo journalctl -u threats-monitor --since "10 min ago" --no-pager | tail -50
```
> Not: Aşama 2 PR'ında timer **enable edilmez**; önce PR review + dry-run. `User=threats-monitor`
> ayrıca oluşturulmalı (izole, minimum yetki — runbook öncesi).

## Üretime geçiş için gerekli secret/ayar listesi

| Ayar | Kaynak |
|---|---|
| `ALERT_WEBHOOK_URL` | CI repo secret `ALERT_WEBHOOK_URL` + `/etc/threats-monitor.env` |
| `ALERT_WEBHOOK_TYPE` | CI repo secret + `/etc/threats-monitor.env` (generic/slack/telegram) |
| `MONITOR_STATE_PATH` | `/var/lib/threats-monitor/state.json` (unit içinde) |
| `threats-monitor` kullanıcısı | oluşturulmalı (`useradd -r -s /usr/sbin/nologin threats-monitor`) |
| Health endpoint deploy | `/api/health/live` + `/api/health/ready` build+deploy (ayrı PR) |
