# threats-0rce

Cyber Threat Intelligence aggregator — [threats.0rce.com](https://threats.0rce.com)

Private, no-SEO, token-gated. Aggregates **~70 public/keyless sources** (RSS feeds, IOC feeds, CVE APIs) into a single searchable dashboard with AI-threat separation.

## Architecture

- **Frontend:** Next.js 14 (App Router), React 18, Tailwind CSS
- **Database:** PostgreSQL 16 (10 tables, 2 views)
- **Cache:** Redis 7
- **Sources:** RSS (47), IOC feeds (7), CVE APIs (NVD, CISA KEV, FIRST EPSS), arXiv
- **Deployment:** Docker Compose on Oracle ARM
- **Public access:** Cloudflare Tunnel via `0rce.com` zone

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

## Quick Start

```bash
cd threats/
cp .env.example .env       # fill in DB password
docker compose up -d
```

Run collectors manually:
```bash
docker exec -it threats-app sh
cd /tmp/collect
npx tsx collect-rss.mts
npx tsx collect-ioc.mts
npx tsx collect-cve.mts
```

## Schema

10 tables, 2 views, 8 indices. See `threats/init/01-schema.sql`.

## License

Private. © 2026 sametyilmaztemel.