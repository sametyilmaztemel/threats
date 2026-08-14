# threats-0rce

Cyber Threat Intelligence aggregator — [threats.0rce.com](https://threats.0rce.com)

Private, no-SEO, token-gated. Aggregates **~70 public/keyless sources** (RSS feeds, IOC feeds, CVE APIs) into a single searchable dashboard with AI-threat separation.

## Architecture

- **Frontend:** Next.js 14 (App Router), React 18, Tailwind CSS
- **Database:** PostgreSQL 16 (10 tables, 2 views)
- **Cache:** Redis 7
- **Sources:** RSS (47), IOC feeds (7), CVE APIs (NVD, CISA KEV, FIRST EPSS), arXiv
- **Deployment:** Docker Compose (production image, self-contained build)
- **Public access:** Cloudflare Tunnel via `0rce.com` zone (origin bound to 127.0.0.1)

## Repo Layout

```
├── docker-compose.yml    # postgres + redis + app + worker
├── .env.example          # cp .env.example .env
├── app/                  # Next.js source (multi-stage Dockerfile)
├── collector/            # RSS / IOC / CVE collectors (TypeScript)
├── db/                   # schema.sql, seed.sql, migrations/
├── scripts/
│   ├── collect.sh        # collector otomasyonu (worker 6 saatte bir çalıştırır)
│   └── backup.sh         # pg_dump + redis save → backups/
├── backups/              # dump'lar (gitignore)
└── logs/                 # (gitignore)
```

## Quick Start (tek komut)

```bash
git clone https://github.com/0rce-Labs/threats-0rce.git
cd threats-0rce
cp .env.example .env       # POSTGRES_PASSWORD değiştir
docker compose up -d       # build + init schema/seed + app + worker
```

- İlk başta `db/schema.sql` + `db/seed.sql` postgres tarafından otomatik uygulanır (docker-entrypoint-initdb.d).
- Sonraki migration'lar: `docker exec threats-postgres psql -U threats -d threats -f /db/migrations/XXX.sql` (db/ bind-mount edili).

## Features

| Route | Purpose |
|-------|---------|
| `/` | Dashboard — overall stats |
| `/feed` | Document feed (1,460+ items) |
| `/actors` | Threat actors |
| `/cves` | Critical CVEs (228+ tracked) |
| `/iocs` | Indicators of compromise (27,920+) |
| `/document/[id]` | Individual document deep-link |
| `/ioc/[id]` | Individual IOC detail |
| `/graph` | Threat graph (vis-network) |
| `/trends` | Trend analysis |
| `/sources` | Source health & metadata |
| `/ai-threats` | AI/ML-specific threats (206+) |

## Collector Otomasyonu

`threats-worker` servisi 6 saatte bir `scripts/collect.sh` çalıştırır (RSS → IOC → CVE).
Manuel tetikleme:

```bash
docker exec threats-worker sh /scripts/collect.sh
```

## Backup

```bash
./scripts/backup.sh              # backups/threats_YYYYMMDD_HHMM.dump
./scripts/backup.sh /mnt/offsite # off-site kopya
```

Restore:

```bash
docker exec -i threats-postgres pg_restore -U threats -d threats --clean < backups/threats_XXXX.dump
```

## Schema

10 tables, 2 views, 8 indices. See `db/schema.sql` + `db/migrations/`.

## Security

- Origin 127.0.0.1:27100 — dış dünya yalnızca Cloudflare Tunnel üzerinden erişir
- Container memory limit'leri: app 512m, worker 256m, postgres 256m, redis 256m
- Healthcheck'ler: app (HTTP), postgres, redis
- `.env` gitignore'da — asla commit etme

## License

Private. © 2026 sametyilmaztemel.
