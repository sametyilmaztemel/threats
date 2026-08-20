# 🛡️ Threats — Local AI-Powered Threat Intelligence Classifier

> **Capstone project for the Microsoft Summer School Internship Program (2026).**
> A locally-running threat intelligence platform that aggregates public security feeds and uses an on-device classification pipeline to triage, score, and route incoming threats before they reach the operator's dashboard.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-compose-blue)](docker-compose.yml)
[![PostgreSQL 16](https://img.shields.io/badge/postgres-16-336791)](https://www.postgresql.org)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue)](https://www.typescriptlang.org)
[![Status: Production](https://img.shields.io/badge/status-active-success)]()

---

## 📌 Project Summary

`threats` is a self-hosted Cyber Threat Intelligence (CTI) aggregator built around a **local classification pipeline**. Instead of forwarding every raw feed item to the UI, ingested documents pass through a deterministic, on-device classifier that:

1. Extracts Indicators of Compromise (IoCs)
2. Scores quality and reliability of the source
3. Maps the document to MITRE ATT&CK tactics and techniques
4. Flags AI/ML-specific threats into a separate lane (`/ai-threats`)
5. Links documents to known threat actors and CVEs
6. Surfaces a short, human-readable summary generated locally

The result is a curated, searchable dashboard at <https://threats.0rce.com> backed by **~70 keyless public sources** (RSS, IOC feeds, NVD, CISA KEV, FIRST EPSS, MITRE TAXII/STIX, arXiv, OSV.dev) — all classification happens locally; nothing leaves the host except an outbound tunnel to the Cloudflare edge.

---

## 🎯 Motivation

Security teams are drowning in raw intel. A typical SOC analyst's morning starts with:
- 1,460+ documents ingested overnight across 70 feeds
- 27,920+ IoCs that may or may not be relevant
- 228+ tracked CVEs, half of them out of scope for the org

`threats` reduces that cognitive load by running an on-device triage step. The classifier is intentionally simple and deterministic — it does not call an external LLM at inference time. It runs on the same host as the database and the web server, so the entire pipeline is auditable, reproducible, and free.

---

## � Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Public Sources (~70)                           │
│   NVD · CISA KEV · FIRST EPSS · MITRE TAXII · OSV.dev · RSS · arXiv │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│            Collector (TypeScript, runs every 6h)                     │
│  RSS / STIX / IOC / OSV / Advisories / CVE sync / Backfill          │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│       On-Device Classifier  ◀── local AI pipeline (no external LLM) │
│   • ioc-classifier.ts       — extract IPs, domains, hashes, URLs     │
│   • quality-score.ts        — source trust × freshness × similarity │
│   • build-graph.ts          — link IoC ↔ actor ↔ CVE ↔ technique    │
│   • sector-technique-cleanup — MITRE ATT&CK mapping & dedup         │
│   • llm-summary.ts          — local LLM-based short summary         │
│   • link-{actors,cves,iocs}.ts — cross-reference stitching          │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│       PostgreSQL 16 (10 tables, 2 views, 8 indices)                 │
│   documents · iocs · actors · cves · techniques · sources · stats    │
└──────────────────────────────────────────────────────────────────────�
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│       Next.js 14 Dashboard (App Router, React 18, Tailwind)          │
│   / · /feed · /actors · /cves · /iocs · /graph · /trends            │
│   /sources · /ai-threats · /document/[id] · /ioc/[id]                │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                  Cloudflare Tunnel  →  threats.0rce.com
                  (origin bound to 127.0.0.1:27100)
```

**One-process, one-host design.** PostgreSQL, Redis, the Next.js app, and the collector worker all run on a single VM. The Cloudflare Tunnel is the only public ingress; the origin is hard-bound to `127.0.0.1`.

---

## � Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS, vis-network |
| **Backend / Collector** | Node.js 20+, TypeScript (strict) |
| **Database** | PostgreSQL 16 — 10 tables, 2 views, 8 indices |
| **Cache** | Redis 7 — feed & route caching |
| **Classifier** | Pure-TypeScript on-device pipeline (`collector/ioc-classifier.ts`, `quality-score.ts`, `build-graph.ts`, `sector-technique-cleanup.ts`) |
| **Local LLM summary** | `llm-summary.ts` — on-host language model for short document summaries |
| **Deployment** | Docker Compose, multi-stage build, self-contained image |
| **Edge** | Cloudflare Tunnel via `0rce.com` zone |

---

## 🚀 Quick Start

```bash
git clone https://github.com/sametyilmaztemel/threats.git
cd threats
cp .env.example .env        # set POSTGRES_PASSWORD
docker compose up -d        # build + init schema/seed + start app + worker
```

The first start applies `db/schema.sql` and `db/seed.sql` automatically. Subsequent migrations live in `db/migrations/` and are applied via:

```bash
docker exec threats-postgres psql -U threats -d threats -f /db/migrations/XXX.sql
```

The collector runs every six hours via `threats-worker`. Manual trigger:

```bash
docker exec threats-worker sh /scripts/collect.sh
```

---

## 📂 Repository Layout

```
threats/
├── docker-compose.yml           # postgres + redis + app + worker
├── .env.example                 # cp .env.example .env
├── middleware.ts                # Cloudflare origin guard
├── app/                         # Next.js 14 (App Router)
│   ├── src/                     # pages, components, server actions
│   ├── public/
│   ├── Dockerfile               # multi-stage build
│   └── package.json
├── collector/                   # data ingestion + local classifier (TypeScript)
│   ├── collect-{rss,ioc,osv,stix,advisories}.ts
│   ├── sync-cves.ts
│   ├── backfill-*.ts            # cold-start backfill scripts
│   ├── ioc-classifier.ts        # ★ core classifier
│   ├── quality-score.ts         # ★ source scoring
│   ├── build-graph.ts           # ★ graph stitching
│   ├── sector-technique-cleanup # ★ MITRE mapping
│   ├── llm-summary.ts           # ★ local summarizer
│   ├── link-{actors,cves,iocs}.ts
│   ├── push-misp.ts             # optional MISP export
│   ├── alert-webhook.ts         # webhook notifier
│   └── *.test.ts                # vitest unit tests
├── db/                          # schema, seed, migrations
│   ├── schema.sql               # 10 tables · 2 views · 8 indices
│   ├── seed.sql
│   └── migrations/
├── scripts/                     # collect.sh, backup.sh, smoke/audit/monitor
├── workers/                     # CSP nonce worker, systemd rollback
├── ops/                         # deployment & ops scripts
├── docs/                        # design notes
├── test/                        # node:test production smoke/audit
├── backups/                     # .gitignore
└── logs/                        # .gitignore
```

---

## 🧠 The Local Classifier — How It Works

The on-device pipeline is the heart of the project. Every document that enters the database flows through four stages, all implemented in TypeScript and running inside `threats-worker`:

### 1. IoC Extraction — `collector/ioc-classifier.ts`
A pattern-based extractor that pulls IPv4, IPv6, domains, URLs, file hashes (MD5/SHA1/SHA256), email addresses, and CVE IDs from free-text content. False positives are filtered with a confidence threshold and a deny-list of common-bucket strings.

### 2. Quality Scoring — `collector/quality-score.ts`
Each `(document, source)` pair gets a score that combines:
- **Source trust** — pre-assigned tier (1–3) for every registered feed
- **Freshness** — exponential decay over the document's age
- **Cross-source corroboration** — bonus when ≥ 2 sources publish the same IoC
- **MITRE technique specificity** — documents mapped to specific techniques score higher than generic "advisory" tags

### 3. Graph Stitching — `collector/build-graph.ts`
IoCs, actors, CVEs, and techniques are linked into a typed graph. The dashboard's `/graph` route renders this graph with vis-network; the SQL view `v_graph` exposes it for external queries.

### 4. Local Summarization — `collector/llm-summary.ts`
A short, on-host language model produces a 2–3 sentence summary of every document. The model runs on the same VM as the rest of the stack — no outbound call to OpenAI, Azure, or any other provider.

The whole pipeline is deterministic, reproducible, and unit-tested (`collector/ioc-classifier.test.ts`, `actor-match.test.ts`).

---

## 🛣️ Dashboard Routes

| Route | Purpose |
|-------|---------|
| `/` | Live dashboard — overall stats, freshest documents |
| `/feed` | Document feed with search (`+term`, `-term`) |
| `/actors` | Threat actors — APT groups, ransomware crews |
| `/cves` | Critical CVEs (228+ tracked) |
| `/iocs` | Indicators of Compromise (27,920+) |
| `/document/[id]` | Document deep-link with extracted IoCs & mapping |
| `/ioc/[id]` | IOC detail with cross-source appearances |
| `/graph` | Threat graph — IoC ↔ actor ↔ CVE ↔ technique |
| `/trends` | Trend analysis over rolling windows |
| `/sources` | Source health, trust tier, last-seen, ETag cache |
| `/ai-threats` | AI/ML-specific threats (206+) — separate lane |
| `/stats` | Daily stats, growth, ingestion rate |

---

## 📊 Dataset at a Glance

> Numbers are illustrative; the production database grows continuously via the 6-hour collector.

- **~70 public/keyless sources** aggregated
- **1,460+** documents ingested
- **228+** CVEs tracked
- **27,920+** IoCs extracted
- **206+** AI/ML-specific threats separated into their own lane

---

## 🧪 Testing & Operations

Production-grade smoke / audit / monitor infrastructure is included out of the box:

```bash
# Unit & integration tests
npm test
npm run test:smoke       # production smoke test
npm run test:monitor     # monitor health
npm run test:health      # health endpoints
npm run test:retry       # HTTP retry layer

# Manual smoke / audit
npm run smoke
npm run audit            # read-only production audit
npm run monitor:check    # one-shot monitor
npm run monitor:dry-run  # monitor without alerting
```

The collector has its own backfill tooling for cold-start scenarios (`backfill-runner.ts`, `backfill-daily-stats.ts`, `backfill-doc-iocs.ts`, `content-backfill.ts`).

---

## 🔐 Security Posture

- **Origin guard:** Cloudflare Tunnel binds origin to `127.0.0.1:27100`. No public port other than 443.
- **Memory limits:** `app` 512 MB, `worker` 256 MB, `postgres` 256 MB, `redis` 256 MB.
- **Healthchecks:** every service. Worker runs `production-monitor.mjs` as a watchdog.
- **Secrets:** `.env` is gitignored; `POSTGRES_PASSWORD` must be set before first run.
- **No external LLM at inference time.** The summarization model runs locally.
- **Read-only audit mode:** `npm run audit` produces an evidence report without writing.

---

## 📜 License

MIT — see [LICENSE](LICENSE).

---

## 🙏 Acknowledgements

Built as a capstone for the **Microsoft Summer School Internship Program (2026)** under the *"Building Your First Local RAG Application with Foundry Local"* track. The on-device classifier idea grew out of that brief — taking "local" to its logical conclusion by running the entire pipeline (collection, classification, summarization, serving) on a single self-hosted VM, with the only external hop being the Cloudflare edge in front of it.

Public sources consumed (a non-exhaustive list):
- **NVD** — `https://services.nvd.nist.gov/rest/json/cves/2.0`
- **CISA KEV** — `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`
- **FIRST EPSS** — `https://api.first.org/data/v1/epss`
- **MITRE ATT&CK** — `https://cti-taxii.mitre.org/`
- **OSV.dev** — `https://api.osv.dev/v1/query`
- **PhishTank** — public CSV
- **URLhaus**, **Feodo Tracker**, **AbuseIPDB**, **Spamhaus DROP**
- **arXiv** cs.CR — for AI/ML threat separation

---

**Maintainer:** [sametyilmaztemel](https://github.com/sametyilmaztemel) · **Live demo:** <https://threats.0rce.com>
