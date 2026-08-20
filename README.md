# 🛡️ Threats — Local AI-Powered Threat Intelligence Classifier

> **Capstone project for the Microsoft Summer School Internship Program (2026).**
> A locally-running threat intelligence platform that aggregates public security feeds and uses an on-device classification pipeline to triage, score, and route incoming threats before they reach the operator's dashboard.
>
> *Microsoft Yaz Okulu Staj Programı (2026) bitirme projesi. Halka açık güvenlik beslemelerini toplayan ve operatörün panosuna ulaşmadan önce gelen tehditleri cihaz üzerinde sınıflandıran, puanlayan ve yönlendiren yerel bir tehdit istihbaratı platformudur.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-compose-blue)](docker-compose.yml)
[![PostgreSQL 16](https://img.shields.io/badge/postgres-16-336791)](https://www.postgresql.org)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue)](https://www.typescriptlang.org)
[![Status: Production](https://img.shields.io/badge/status-active-success)]()
[![Docs: Bilingual EN/TR](https://img.shields.io/badge/docs-EN%2FTR-brightgreen)](#-documentation--dokümantasyon)

---

## 📌 Project Summary / Proje Özeti

**EN:** `threats` is a self-hosted Cyber Threat Intelligence (CTI) aggregator built around a **local classification pipeline**. Instead of forwarding every raw feed item to the UI, ingested documents pass through a deterministic, on-device classifier that extracts IoCs, scores quality, maps to MITRE ATT&CK, links to actors and CVEs, and surfaces a short locally-generated summary. The result is a curated, searchable dashboard at <https://threats.0rce.com> backed by **~70 keyless public sources** — all classification happens locally; nothing leaves the host except an outbound tunnel to the Cloudflare edge.

**TR:** `threats`, **yerel bir sınıflandırma hattı** etrafında kurulmuş, kendi sunucusunda barındırılan bir Siber Tehdit İstihbaratı (CTI) toplayıcısıdır. Her ham besleme öğesini doğrudan arayüze iletmek yerine, alınan dokümanlar cihaz üzerinde çalışan belirleyici bir sınıflandırıcıdan geçer: IoC çıkarımı, kalite puanlama, MITRE ATT&CK eşlemesi, aktör/CVE bağlantıları ve kısa bir yerel özet üretimi yapılır. Sonuç, **~70 anahtarsız halka açık kaynaktan** beslenen, <https://threats.0rce.com> adresindeki seçilmiş ve aranabilir bir paneldir — tüm sınıflandırma yerelde gerçekleşir; konak dışına sadece Cloudflare kenarına giden tünel çıkar.

The on-device pipeline runs six steps on every incoming document:

1. **Ingest** — pull from RSS, STIX, IOC feeds, NVD, OSV, GHSA, arXiv (~70 sources)
2. **Extract** — pattern-based IoC extraction (IPs, domains, URLs, hashes, CVEs)
3. **Score** — source trust × freshness × cross-source corroboration
4. **Map** — MITRE ATT&CK tactics/techniques, kill-chain, sectors, AI-threat lane
5. **Link** — graph edges: document ↔ IoC ↔ actor ↔ CVE ↔ technique
6. **Summarize** — short, locally-generated 2–3 sentence summary

---

## 🎯 Motivation / Motivasyon

**EN:** Security teams are drowning in raw intel. A typical SOC analyst's morning starts with 1,460+ documents ingested overnight across 70 feeds, 27,920+ IoCs that may or may not be relevant, and 228+ tracked CVEs, half of them out of scope. `threats` reduces that cognitive load by running an on-device triage step. The classifier is intentionally simple and deterministic — it does not call an external LLM at inference time, so the entire pipeline is auditable, reproducible, and free of recurring API costs.

**TR:** Güvenlik ekipleri ham istihbaratla boğuluyor. Tipik bir SOC analistinin sabahı, 70 kaynaktan gece boyunca alınan 1.460+ doküman, ilgili olup olmadığı belli olmayan 27.920+ IoC ve yarısı kapsam dışı 228+ izlenen CVE ile başlar. `threats` bu bilişsel yükü cihaz üzerinde bir triyaj adımı çalıştırarak azaltır. Sınıflandırıcı bilinçli olarak basit ve belirleyicidir — çıkarım zamanında harici bir LLM çağırmaz, dolayısıyla tüm hat denetlenebilir, tekrarlanabilir ve sürekli API maliyetinden arınmış olur.

---

## 🏗 Architecture / Mimari

```
┌──────────────────────────────────────────────────────────────────────┐
│                  Public Sources · Halka Açık Kaynaklar (~70)         │
│  NVD · CISA KEV · FIRST EPSS · MITRE TAXII · OSV · RSS · arXiv ·    │
│  URLhaus · Feodo · PhishTank · OpenPhish · Spamhaus · GHSA          │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│         Collector (TypeScript, every 6h · her 6 saatte bir)          │
│  RSS / STIX / IOC / OSV / Advisories / CVE sync / Backfill           │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│      On-Device Classifier  ◀── local AI pipeline (no external LLM)  │
│   • ioc-classifier.ts       — extract IPs, domains, hashes, URLs    │
│   • quality-score.ts        — source trust × freshness × corrobor.  │
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
└──────────────────────────────────────────────────────────────────────┘
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

**EN:** One-process, one-host design. PostgreSQL, Redis, the Next.js app, and the collector worker all run on a single VM. The Cloudflare Tunnel is the only public ingress; the origin is hard-bound to `127.0.0.1`.

**TR:** Tek-süreç, tek-sunucu tasarımı. PostgreSQL, Redis, Next.js uygulaması ve toplayıcı işçisi tek bir VM üzerinde çalışır. Cloudflare Tüneli tek halka açık giriş noktasıdır; kaynak `127.0.0.1`'e sıkıca bağlıdır.

---

## 🧰 Tech Stack / Teknoloji Yığını

| Layer / Katman | Technology / Teknoloji |
|----------------|------------------------|
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS, vis-network |
| **Backend / Collector** | Node.js 20+, TypeScript (strict) |
| **Database** | PostgreSQL 16 — 10 tables, 2 views, 8 indices |
| **Cache** | Redis 7 — feed & route caching |
| **Classifier** | Pure-TypeScript on-device pipeline (`collector/ioc-classifier.ts`, `quality-score.ts`, `build-graph.ts`, `sector-technique-cleanup.ts`) |
| **Local LLM summary** | `llm-summary.ts` — on-host language model for short summaries |
| **Deployment** | Docker Compose, multi-stage build, self-contained image |
| **Edge** | Cloudflare Tunnel via `0rce.com` zone |

---

## 🚀 Quick Start / Hızlı Başlangıç

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

The collector runs every six hours via `threats-worker`. Manual trigger / Manuel tetikleme:

```bash
docker exec threats-worker sh /scripts/collect.sh
```

---

## 📂 Repository Layout / Dizin Yapısı

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
├── docs/                        # design notes & process docs (see below)
├── test/                        # node:test production smoke/audit
├── backups/                     # .gitignore
└── logs/                        # .gitignore
```

---

## 🧠 Local AI Architecture / Yerel YZ Mimarisi

**EN:** The platform's intelligence layer is **fully local, fully deterministic, and reproducible by design**. There is no external API call on the inference path. Every classification, scoring, linking, and summarization decision happens on the same VM that runs PostgreSQL and the Next.js dashboard. The only thing that leaves the host is the Cloudflare Tunnel bytes.

**TR:** Platformun istihbarat katmanı **tamamen yerel, tamamen belirleyici ve tasarım gereği tekrarlanabilirdir**. Çıkarım yolunda harici API çağrısı yoktur. Her sınıflandırma, puanlama, bağlama ve özetleme kararı, PostgreSQL ve Next.js panosunu çalıştıran aynı VM üzerinde gerçekleşir. Konağı terk eden tek şey Cloudflare Tüneli baytlarıdır.

The architecture has **seven local-AI components**, each implemented as a standalone TypeScript module under `collector/`. They run in sequence during the 6-hour cycle and can also be invoked individually for backfill or testing.

Mimari **yedi yerel YZ bileşeninden** oluşur; her biri `collector/` altında bağımsız bir TypeScript modülü olarak uygulanmıştır. 6 saatlik döngüde sırayla çalışırlar ve backfill veya test için ayrı ayrı da çağrılabilirler.

### Component Map / Bileşen Haritası

```
   ┌─────────────────────────── 6-hour cron / on-demand ─────────────────────────────┐
   │                                                                                  │
   │   ┌──────────────────┐                                                          │
   │   │ collect-rss.ts   │ 47 RSS feeds, 9 IOC feeds, NVD, CISA, EPSS, OSV, GHSA,  │
   │   │ collect-ioc.ts   │ arXiv cs.CR/cs.AI, MITRE TAXII  →  raw documents        │
   │   │ collect-stix.ts  │  (collector.runs collection; pure HTTP, no AI here)     │
   │   └────────┬─────────┘                                                          │
   │            │                                                                    │
   │            ▼                                                                    │
   │   ┌────────────────────┐                                                        │
   │   │ ioc-classifier.ts  │ ◀── local AI ①  Evidence-weighted IoC classifier      │
   │   │ extract-iocs.ts    │ ◀── local AI ②  Pattern extractor (regex + heuristics) │
   │   └────────┬───────────┘                                                        │
   │            │                                                                    │
   │            ▼                                                                    │
   │   ┌──────────────────────────┐                                                  │
   │   │ sector-technique-        │ ◀── local AI ③  MITRE ATT&CK + sector keyword  │
   │   │   cleanup.ts             │     classifier (11 sectors × 13 techniques)     │
   │   └────────┬─────────────────┘                                                  │
   │            │                                                                    │
   │            ▼                                                                    │
   │   ┌──────────────────┐                                                          │
   │   │ actor-match.ts   │ ◀── local AI ④  Threat-actor alias resolution          │
   │   └────────┬─────────┘                                                          │
   │            │                                                                    │
   │            ▼                                                                    │
   │   ┌──────────────────┐                                                          │
   │   │ build-graph.ts   │ ◀── local AI ⑤  Graph stitching (typed edges)          │
   │   └────────┬─────────┘                                                          │
   │            │                                                                    │
   │            ▼                                                                    │
   │   ┌──────────────────┐                                                          │
   │   │ quality-score.ts │ ◀── local AI ⑥  Deterministic 0-100 quality scoring    │
   │   └────────┬─────────┘                                                          │
   │            │                                                                    │
   │            ▼                                                                    │
   │   ┌──────────────────────┐                                                      │
   │   │ llm-summary.ts       │ ◀── local AI ⑦ (optional, off by default)          │
   │   │   deterministic       │     Falls back to deterministic summary if no       │
   │   │   short-summary.ts    │     LLM endpoint configured                       │
   │   └────────┬─────────────┘                                                      │
   │            │                                                                    │
   │            ▼                                                                    │
   │        PostgreSQL 16  →  Next.js dashboard  →  Cloudflare edge                 │
   └──────────────────────────────────────────────────────────────────────────────────┘
```

### ① IoC Classifier / IoC Sınıflandırıcı — `collector/ioc-classifier.ts`

**EN:** The single most subtle component. It assigns every extracted indicator one of **four severity levels** based on contextual evidence, not pattern match alone:

| Level / Seviye | Confidence / Güven | Meaning / Anlam |
|----------------|--------------------|------------------|
| `mentioned` | 0.10 | The value appears in the text but the document is just talking about it (e.g. *"threat actors use github.com for hosting"*). Stored for completeness, **filtered out of all "real" IoC counts**. |
| `observed` | 0.50 | The value appeared in source content with no supporting signal. Default classification. |
| `suspicious` | 0.70 | A trustworthy source referenced the value as a candidate. Worth analyst attention. |
| `confirmed_malicious` | 0.95 | Strong context signal — a feed source tagged it as malicious, **or** the source itself is a known IOC feed (URLhaus, ThreatFox, MalwareBazaar). |

The classifier maintains a **public-infrastructure deny list** of 30+ domains (`github.com`, `microsoft.com`, `cloudflare.com`, `aws.amazon.com`, ...) that are **never** treated as malicious IoCs no matter what the text says. This single line of policy prevents the recurring bug where blog posts about threat actors mentioning legitimate services would inflate the IOC counts.

**TR:** En ince bileşen. Her çıkarılan göstergeyi, salt kalıp eşleşmesine değil **bağlamsal kanıta** dayanarak **dört önem seviyesinden** birine atar:

| Seviye | Güven | Anlam |
|--------|-------|-------|
| `mentioned` (anıldı) | 0.10 | Değer metinde geçiyor ancak doküman sadece ondan bahsediyor (örn. *"tehdit aktörleri github.com'u barındırma için kullanıyor"*). Bütünlük için saklanır, **tüm "gerçek" IoC sayımlarından filtrelenir**. |
| `observed` (gözlemlendi) | 0.50 | Değer destekleyici sinyal olmaksızın kaynak içerikte göründü. Varsayılan sınıflandırma. |
| `suspicious` (şüpheli) | 0.70 | Güvenilir bir kaynak değeri aday olarak gösterdi. Analist dikkatine değer. |
| `confirmed_malicious` (doğrulanmış kötü amaçlı) | 0.95 | Güçlü bağlam sinyali — bir besleme kaynağı onu kötü amaçlı olarak etiketledi **veya** kaynağın kendisi bilinen bir IoC beslemesi (URLhaus, ThreatFox, MalwareBazaar). |

Sınıflandırıcı, metin ne derse desin **asla** kötü amaçlı IoC olarak işlem görmeyen 30+ alan adından (`github.com`, `microsoft.com`, `cloudflare.com`, `aws.amazon.com`, ...) oluşan bir **halka açık altyapı reddetme listesi** tutar. Bu tek politika satırı, tehdit aktörlerinden bahseden blog yazılarının meşru hizmetleri anmasının IoC sayılarını şişirmesine yol açan tekrarlayan hatayı engeller.

**Determinism / Belirleyicilik:** The classifier's `classifyIoc()` function is a pure function of `(value, type, context)`. Same input → same output, byte-for-byte, on every run, on every host. This is what makes the dashboard's per-source IoC numbers auditable.

**Birim testi:** `collector/ioc-classifier.test.ts` — 19 test case ile dört seviyenin tamamı ve reddetme listesi kapsanmaktadır.

### ② IoC Pattern Extractor / IoC Kalıp Çıkarıcı — `collector/extract-iocs-from-text.ts`

**EN:** A pure regex-based extractor with **heuristic post-filters** that turn the noisy problem of free-text extraction into a clean one. Patterns covered:

- **IPv4** — strict octet validation, `255.255.255.255` excluded
- **URL** — `http(s)://...` with terminal punctuation stripped
- **MD5 / SHA1 / SHA256** — exact-length hex blocks
- **Domain** — RFC-1035 friendly label regex, max 24-char TLD

The non-trivial part is what comes **after** the regex match:

| Heuristic / Sezgisel | Purpose / Amaç |
|----------------------|----------------|
| **Private-IP filter** | Drop `10.0.0.0/8`, `172.16/12`, `192.168/16`, `127/8`, `0/8`, `224/8+` — RFC 5735 / 6890 reserved ranges. A 10.0.0.1 mention in a security post is not an IoC. |
| **Version-context heuristic** | An IPv4-shaped value that appears within 30 chars of `version`, `build`, `release`, or `kernel` is treated as a software version, not an indicator. The 1.x.x.x software-version false-positive class disappears. |
| **Common-bucket deny list** | `example.com`, `localhost`, `0.0.0.0`, `255.255.255.255`, `foo.bar.baz`, RFC 2606 reserved. |

**TR:** Serbest metin çıkarımının gürültülü problemini temiz bir problem haline getiren **sezgisel son filtrelerle** donatılmış saf düzenli ifade tabanlı bir çıkarıcı. Kapsanan kalıplar:

- **IPv4** — sıkı oktet doğrulaması, `255.255.255.255` hariç
- **URL** — `http(s)://...` ile birlikte terminal noktalama temizlenir
- **MD5 / SHA1 / SHA256** — tam-uzunlukta onaltılık bloklar
- **Alan adı** — RFC-1035 uyumlu etiket düzenli ifadesi, en fazla 24 karakter TLD

Önemsiz olmayan kısım, düzenli ifade eşleşmesinden **sonra** gelen kısımdır:

| Sezgisel | Amaç |
|----------|------|
| **Özel-IP filtresi** | `10.0.0.0/8`, `172.16/12`, `192.168/16`, `127/8`, `0/8`, `224/8+` — RFC 5735 / 6890 ayrılmış aralıkları çıkar. Bir güvenlik yazısındaki 10.0.0.1 anılması IoC değildir. |
| **Sürüm bağlamı sezgiseli** | `version`, `build`, `release` veya `kernel` anahtar kelimelerinin 30 karakteri içinde görünen IPv4 şeklindeki bir değer, gösterge değil yazılım sürümü olarak işlem görür. 1.x.x.x yazılım-sürümü yanlış-pozitif sınıfı ortadan kalkar. |
| **Genel kova reddetme listesi** | `example.com`, `localhost`, `0.0.0.0`, `255.255.255.255`, `foo.bar.baz`, RFC 2606 ayrılmış. |

**Why heuristics over a fine-tuned model? / Neden ince-ayarlı model yerine sezgisel?** A fine-tuned NER model would be marginally better at *recall* on novel indicators, but it would be wrong in different, harder-to-debug ways (no per-decision explanation, no deterministic replay, requires GPU). The heuristic pipeline is auditable line-by-line, runs in <50 ms per document, and is reproducible across hosts.

*İnce-ayarlı bir NER modeli yeni göstergeler için *geri çağırmada* marjinal olarak daha iyi olurdu, ancak hata ayıklaması daha zor farklı şekillerde yanlış olurdu (karar başına açıklama yok, belirleyici tekrar oynatma yok, GPU gerektirir). Sezgisel hat satır satır denetlenebilir, doküman başına <50 ms çalışır ve konaklar arasında tekrarlanabilirdir.*

### ③ MITRE ATT&CK + Sector Classifier / MITRE ATT&CK + Sektör Sınıflandırıcı — `collector/sector-technique-cleanup.ts`

**EN:** A **keyword-based local classifier** that maps each document's free text to:
- **11 sectors** — finance, healthcare, government, technology, education, energy, retail, manufacturing, telecom, transportation, media
- **13 MITRE ATT&CK techniques** — Exploit Public-Facing Application, Phishing, Data Encrypted for Impact, Spearphishing Attachment, Exploitation for Privilege Escalation, Exploitation for Defense Evasion, Brute Force, Valid Accounts, Remote Service Exploitation, Supply Chain Compromise, Drive-by Compromise, Lateral Movement, Exfiltration Over C2 Channel

The keyword set is hand-curated, not generated. Each entry has 2–7 anchor phrases:

```ts
// finance sector — anchors
const SECTOR_KEYWORDS: Record<string, string[]> = {
  'finance': ['bank', 'banking', 'financial', 'financial loss', 'monetary',
              'transaction', 'swift', 'atm', 'cryptocurrency', 'wallet',
              'bitcoin', 'ethereum', 'trading platform'],
  // ...
};

// Exploit Public-Facing Application technique — anchors
const TECHNIQUE_KEYWORDS: Record<string, string[]> = {
  'Exploit Public-Facing Application':
    ['public-facing application', 'web application exploit',
     'exploit public-facing', 'cve-', 'vulnerability in',
     'authenticated access', 'unauthenticated remote attacker'],
  // ...
};
```

**Why not an embedding-based classifier? / Neden gömme-tabanlı bir sınıflandırıcı değil?** Two reasons. First, the technique space is small (13 entries) and the keywords are already high-precision — embedding similarity tends to drag in adjacent-but-wrong techniques (e.g. matching "phishing" to "Valid Accounts" via credential-theft adjacency). Second, **explainability** is part of the spec: every `(document, technique)` edge records the matched phrase, which is what powers the dashboard's "why was this tagged" inspector. A vector-similarity edge would lose that.

*İki neden. Birincisi, teknik uzayı küçük (13 giriş) ve anahtar kelimeler zaten yüksek kesinlikte — gömme benzerliği, bitişik-ama-yanlış teknikleri içeri çekme eğilimindedir (örn. "phishing"i kimlik bilgisi-hırsızlığı bitişikliği yoluyla "Valid Accounts" ile eşleştirmek). İkincisi, **açıklanabilirlik** spesifikasyonun parçasıdır: her `(doküman, teknik)` kenarı, eşleşen ifadeyi kaydeder; bu da panonun "bu neden etiketlendi" denetimcisini güçlendirir. Vektör benzerliği kenarı bunu kaybederdi.*

The cleanup is **idempotent and transactional**: low-confidence matches are wiped before re-classification, and the entire run is wrapped in a single PostgreSQL transaction so a partial failure rolls back cleanly.

*Temizleme **bölünebilir ve işlemseldir**: düşük güvenli eşleşmeler yeniden sınıflandırmadan önce silinir ve tüm çalıştırma tek bir PostgreSQL işlemine sarılır, böylece kısmi başarısızlık temiz bir şekilde geri alınır.*

### ④ Actor Alias Resolver / Aktör Takma Ad Çözücü — `collector/actor-match.ts`

**EN:** Real threat-actor names live in many forms. APT1 is also `Comment Crew`, `Comment Group`, `Shanghai Group`. Lazarus is also `APT38`, `Hidden Cobra`, `Zinc`, `Diamond Sleet`. The alias resolver takes the raw text and returns the canonical actor name by:

1. **Direct match** against a curated alias table (~200 actors, ~1,200 aliases)
2. **Alias normalization** — lowercased, diacritics stripped, common infix stripped (`-`, `_`, `.`)
3. **Disambiguation** — when the same alias maps to multiple canonicals (rare, e.g. shared C2 infrastructure), the resolver picks the one with the most co-occurring indicators in the document

**TR:** Gerçek tehdit aktörü isimleri birçok biçimde yaşar. APT1 aynı zamanda `Comment Crew`, `Comment Group`, `Shanghai Group`. Lazarus aynı zamanda `APT38`, `Hidden Cobra`, `Zinc`, `Diamond Sleet`. Takma ad çözücü ham metni alır ve şu yollarla kanonik aktör adını döndürür:

1. Eğrilmiş bir takma ad tablosuna karşı **doğrudan eşleşme** (~200 aktör, ~1.200 takma ad)
2. **Takma ad normalleştirme** — küçük harfe çevirme, aksan işaretleri çıkarma, yaygın ekleri kaldırma (`-`, `_`, `.`)
3. **Belirsizlik giderme** — aynı takma ad birden çok kanonik adla eşleştiğinde (nadir, örn. paylaşılan C2 altyapısı), çözücü dokümandaki en çok birlikte görülen göstergeyle eşleşeni seçer

**Determinism / Belirleyicilik:** The function `resolveActor(text: string, documentIoCs: Set<string>): CanonicalActor` is pure. Same input → same canonical name, every time, on every host. The 9 KB module is fully unit-tested.

### ⑤ Graph Stitcher / Grafik Birleştirici — `collector/build-graph.ts`

**EN:** Every link in the threat graph is computed locally, not queried from an external knowledge graph. Three kinds of edges are produced, each with a typed schema and a confidence score:

| Edge / Kenar | Source / Kaynak | Confidence |
|--------------|----------------|------------|
| `actor → technique (uses)` | `actors.ttps` × MITRE ATT&CK | 0.90 |
| `actor → actor (co-mentioned)` | `documents.actors` co-occurrence count | proportional to count |
| `actor → sector (targets)` | `documents.sectors` × `documents.actors` | 0.70 |

The graph is materialized into a `graph_edges` table, and the SQL view `v_graph` exposes it for the dashboard's `/graph` route and any external API consumer. The view is rebuilt from scratch each run (`TRUNCATE` + re-population) — fully idempotent.

**TR:** Tehdit grafiğindeki her bağlantı harici bir bilgi grafiğinden sorgulanmaz, yerelde hesaplanır. Üç tür kenar üretilir; her birinin tiplendirilmiş bir şeması ve güven puanı vardır:

| Kenar | Kaynak | Güven |
|-------|--------|-------|
| `aktör → teknik (kullanır)` | `actors.ttps` × MITRE ATT&CK | 0.90 |
| `aktör → aktör (birlikte anıldı)` | `documents.actors` birlikte-geçme sayısı | sayıyla orantılı |
| `aktör → sektör (hedefler)` | `documents.sectors` × `documents.actors` | 0.70 |

Grafik bir `graph_edges` tablosuna somutlaştırılır ve SQL view `v_graph` panonun `/graph` rotası ile harici API tüketicileri için onu dışa açar. View her çalıştırmada sıfırdan yeniden oluşturulur (`TRUNCATE` + yeniden doldurma) — tamamen bölünebilir.

### ⑥ Quality Scorer / Kalite Puanlayıcı — `collector/quality-score.ts`

**EN:** Every document gets a **deterministic 0–100 quality score** computed from:

| Component / Bileşen | Max Points | Rationale / Gerekçe |
|----------------------|------------|---------------------|
| `word_count` bucket | 50 | 0–50 words → 0 pts; 50–200 → 20; 200–500 → 40; 500+ → 50 |
| Entity richness (actors + CVEs + techniques + sectors + IoCs) | 30 | Capped at 30 to prevent a single huge-incident doc from dominating |
| Kill-chain phase tagged | 5 | Indicates structured intelligence, not a news byte |
| AI-threat flag | 5 | Signals the doc belongs to the `/ai-threats` lane |
| Source tier (1=authoritative, 2=trusted, 3=community) | 10 | T1=10, T2=7, T3=4 |

The score is recomputed every cycle and the column is `quality_score INTEGER DEFAULT 0`. Dashboard routes can filter by minimum score, and the `/sources` page surfaces a per-source average to spot feed-quality drift.

**TR:** Her doküman, aşağıdakilerden hesaplanan **belirleyici 0–100 kalite puanı** alır:

| Bileşen | En Fazla Puan | Gerekçe |
|---------|---------------|---------|
| `word_count` kovası | 50 | 0–50 kelime → 0 pt; 50–200 → 20; 200–500 → 40; 500+ → 50 |
| Varlık zenginliği (aktörler + CVE'ler + teknikler + sektörler + IoC'ler) | 30 | Tek bir büyük olay dokümanının baskın olmasını engellemek için 30'da sınırlandırıldı |
| Kill-chain fazı etiketli | 5 | Yapılandırılmış istihbarata işaret eder, bir haber parçasına değil |
| YZ-tehdit bayrağı | 5 | Dokümanın `/ai-threats` şeridine ait olduğunu belirtir |
| Kaynak seviyesi (1=yetkili, 2=güvenilir, 3=topluluk) | 10 | T1=10, T2=7, T3=4 |

Puan her döngüde yeniden hesaplanır ve kolon `quality_score INTEGER DEFAULT 0` şeklindedir. Pano rotaları minimum puana göre filtreleyebilir ve `/sources` sayfası, kaynak kalitesi kaymasını tespit etmek için kaynak başına ortalamayı yüzeye çıkarır.

### ⑦ Optional LLM Summary / İsteğe Bağlı LLM Özeti — `collector/llm-summary.ts`

**EN:** This is the **only** component in the architecture that is allowed to talk to an external service, and it is **off by default**. The behavior is:

```ts
// llm-summary.ts (excerpt)
const ENDPOINT = process.env.LLM_ENDPOINT || '';
const API_KEY  = process.env.LLM_API_KEY  || '';

if (!ENDPOINT || !API_KEY) {
  log('LLM_ENDPOINT/API_KEY tanımsız — deterministik özet korunuyor (atlandı)');
  return;   // ← defaults to skipping entirely
}
```

**When unconfigured:** the script is a no-op. Documents keep the deterministic short summary derived from their first paragraph + extracted entities. This is the production default.

**When configured:** the script POSTs to `LLM_ENDPOINT` (e.g. `https://api.openai.com/v1/chat/completions` or a local Ollama endpoint at `http://127.0.0.1:11434/v1/chat/completions`) with a system prompt that pins the model to a "threat intelligence analyst" persona. The summary is then written back to `documents.summary`, **replacing** the deterministic one.

**TR:** Bu, mimaride harici bir hizmetle konuşmasına izin verilen **tek** bileşendir ve **varsayılan olarak kapalıdır**. Davranış şöyledir:

```ts
// llm-summary.ts (parça)
const ENDPOINT = process.env.LLM_ENDPOINT || '';
const API_KEY  = process.env.LLM_API_KEY  || '';

if (!ENDPOINT || !API_KEY) {
  log('LLM_ENDPOINT/API_KEY tanımsız — deterministik özet korunuyor (atlandı)');
  return;   // ← tamamen atlamayı varsayar
}
```

**Yapılandırılmamışken:** betik bir no-op'tur. Dokümanlar, ilk paragraflarından + çıkarılan varlıklardan türetilen belirleyici kısa özeti korur. Bu üretim varsayılanıdır.

**Yapılandırıldığında:** betik, modeli "tehdit istihbaratı analisti" kişiliğine sabitleyen bir sistem komutuyla `LLM_ENDPOINT`'e (örn. `https://api.openai.com/v1/chat/completions` veya `http://127.0.0.1:11434/v1/chat/completions`'deki yerel bir Ollama uç noktası) POST atar. Özet daha sonra `documents.summary`'e **geri yazılır** ve belirleyici olanın **yerini alır**.

**Why optional, not required? / Neden isteğe bağlı, neden zorunlu değil?** Because the project's spec is **reproducibility first**. A hosted LLM endpoint would (a) cost per call, (b) vary the output between runs even with the same input, (c) introduce an external dependency the rest of the stack doesn't have. The platform's promise to a reviewer is: *any number you see in the dashboard is a function of the documents in the database, not a function of which model was online when you asked*. The optional LLM path is documented and tested, but it is not in the default loop.

*Çünkü projenin spesifikasyonu **önce tekrarlanabilirlik**tir. Barındırılan bir LLM uç noktası (a) çağrı başına maliyet oluşturur, (b) aynı girdiyle bile çalıştırmalar arasında çıktıyı değiştirir, (c) yığının geri kalanının sahip olmadığı harici bir bağımlılık getirir. Platformun bir incelemeye verdiği söz şudur: *panoda gördüğünüz her sayı, veritabanındaki dokümanların bir fonksiyonudur, sorduğunuzda hangi modelin çevrimiçi olduğunun değil*. İsteğe bağlı LLM yolu belgelenmiş ve test edilmiştir, ancak varsayılan döngüde değildir.*

**Where an LLM can be plugged in / Bir LLM'nin nereye takılabileceği:**

```env
# .env.example (already shipped)
LLM_ENDPOINT=https://api.openai.com/v1/chat/completions   # or your local Ollama
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini                                      # or llama3.1:8b, qwen2.5:7b, ...
LLM_BATCH=10                                               # docs per run
```

If you point `LLM_ENDPOINT` at a local Ollama (`http://127.0.0.1:11434/v1/chat/completions`), the entire pipeline remains local — the optionality is about the *contract*, not the *topology*.

*`LLM_ENDPOINT`'i yerel bir Ollama'ya (`http://127.0.0.1:11434/v1/chat/completions`) yönlendirirseniz, tüm hat yerel kalır — isteğe bağlılık *sözleşmeyle* ilgilidir, *topolojiyle* değil.*

### Properties of the Local AI Layer / Yerel YZ Katmanının Özellikleri

| Property / Özellik | Mechanism / Mekanizma |
|--------------------|------------------------|
| **No external call on the inference path / Çıkarım yolunda harici çağrı yok** | Every classifier is a pure function; LLM summary is off by default. |
| **Deterministic / Belirleyici** | Pure functions + PostgreSQL `ON CONFLICT DO NOTHING` + idempotent scripts. Same input → same output, byte-for-byte, on every run, on every host. |
| **Auditable / Denetlenebilir** | Every classification decision stores the matched phrase, the confidence, and the reason. The "why was this tagged" inspector on each document page renders this metadata. |
| **Reproducible / Tekrarlanabilir** | A fresh checkout of the repo + a PostgreSQL dump is sufficient to regenerate every dashboard number. No model weights to track, no API versions to pin. |
| **Cheap / Ucuz** | The whole 6-hour pipeline runs in <2 minutes wall-clock on a 4-vCPU VM. No GPU. No paid API. |
| **Hot-swappable / Yerinde değiştirilebilir** | Want to upgrade the IoC classifier to a fine-tuned NER? Drop in a new module, keep the same `(value, type, context) → classification` signature, and every downstream consumer keeps working. The architecture is the contract. |

---

## 🛣 Dashboard Routes / Pano Rotaları

| Route | Purpose / Amaç |
|-------|----------------|
| `/` | Live dashboard — overall stats, freshest documents / Genel istatistikler, en yeni dokümanlar |
| `/feed` | Document feed with search (`+term`, `-term`) / Arama destekli doküman akışı |
| `/actors` | Threat actors — APT groups, ransomware crews / Tehdit aktörleri — APT grupları, fidye yazılım çeteleri |
| `/cves` | Critical CVEs (228+ tracked) / Kritik CVE'ler (228+ izleniyor) |
| `/iocs` | Indicators of Compromise (27,920+) / Uzlaşma göstergeleri |
| `/document/[id]` | Document deep-link with extracted IoCs & mapping / Çıkarılmış IoC ve eşlemeyle doküman detayı |
| `/ioc/[id]` | IOC detail with cross-source appearances / Kaynaklar arası görünümlerle IOC detayı |
| `/graph` | Threat graph — IoC ↔ actor ↔ CVE ↔ technique / Tehdit grafiği |
| `/trends` | Trend analysis over rolling windows / Kayan pencerelerle trend analizi |
| `/sources` | Source health, trust tier, last-seen, ETag cache / Kaynak sağlığı, güven seviyesi |
| `/ai-threats` | AI/ML-specific threats (206+) — separate lane / YZ/ML'ye özgü tehditler — ayrı şerit |
| `/stats` | Daily stats, growth, ingestion rate / Günlük istatistikler, büyüme, alım hızı |

---

## 📚 Information Sources / Bilgi Kaynakları

**EN:** The platform aggregates data from **~70 public, keyless, license-respecting sources**. The list below is the actively-consumed set; some are on-demand (backfill), some are streaming (every 6h).

**TR:** Platform, **~70 halka açık, anahtarsız ve lisans koşullarına uygun kaynaktan** veri toplar. Aşağıdaki liste etkin olarak tüketilen kaynaklardır; bazıları isteğe bağlı (backfill), bazıları sürekli (6 saatte bir) çalışır.

### CVE & Vulnerability Feeds / CVE ve Zafiyet Beslemeleri

| Source | URL | Purpose / Amaç |
|--------|-----|----------------|
| **NVD** (NIST) | `services.nvd.nist.gov/rest/json/cves/2.0` | Authoritative CVE feed with CVSS, references, CPE / CVSS ve referanslarla yetkili CVE beslemesi |
| **CISA KEV** | `cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json` | Known Exploited Vulnerabilities catalog / Bilinen istismar edilen zafiyetler kataloğu |
| **FIRST EPSS** | `api.first.org/data/v1/epss` | Exploit Prediction Scoring System / İstismar tahmin puanlama sistemi |
| **OSV.dev** | `api.osv.dev/v1/query` | Open-source vulnerability database (PyPI, crates.io, Go, NuGet, OSS-Fuzz, Maven) / Açık kaynak zafiyet veritabanı |
| **GHSA** (GitHub) | `api.github.com/advisories` | GitHub Security Advisories / GitHub güvenlik bildirimleri |

### MITRE & Standards / MITRE ve Standartlar

| Source | URL | Purpose / Amaç |
|--------|-----|----------------|
| **MITRE ATT&CK TAXII** | `cti-taxii.mitre.org/` | ATT&CK STIX bundles — tactics, techniques, actors, malware / ATT&CK STIX paketleri — taktikler, teknikler, aktörler |
| **MITRE CAPEC** | `capec.mitre.org/data/capec_v3.9.xml` | Common Attack Pattern Enumeration and Classification / Yaygın saldırı kalıpları sınıflandırması |

### IoC Feeds / IoC Beslemeleri

| Source | URL | Purpose / Amaç |
|--------|-----|----------------|
| **URLhaus** (abuse.ch) | `urlhaus.abuse.ch/downloads/csv_recent/` | Malicious URL feed / Kötü amaçlı URL beslemesi |
| **Feodo Tracker** | `feodotracker.abuse.ch/downloads/ipblocklist.txt` | Botnet C2 IP blocklist / Botnet C2 IP engelleme listesi |
| **ThreatFox** | `threatfox.abuse.ch/export/csv/recent/` | IOC database (IP, domain, hash) / IOC veritabanı |
| **MalwareBazaar** | `mb-api.abuse.ch/api/v1/` | Malware sample database / Zararlı yazılım örnekleri veritabanı |
| **PhishTank** | `phishtank.org/export/online-valid.csv` | Phishing URL database / Oltalama URL veritabanı |
| **OpenPhish** | `openphish.com/feed.txt` | Real-time phishing feed / Gerçek zamanlı oltalama beslemesi |
| **Spamhaus DROP** | `spambots.andspam.com/listed/` | Don't Route Or Peer list / Yönlendirme veya eşleme yapılmaması gerekenler listesi |
| **SSLBL** (abuse.ch) | `sslbl.abuse.ch/blacklist/sslbl.csv` | SSL certificates used by botnet C2 / Botnet C2 tarafından kullanılan SSL sertifikaları |
| **AbuseIPDB** (community) | `abuseipdb.com` (rate-limited) | IP reputation database / IP itibar veritabanı |
| **phishing.army** | `phishing.army/download/phishing_army_blocklist_extended.txt` | Phishing blocklist (community) / Oltalama engelleme listesi |

### RSS / News / Blog

47 RSS sources tracked, including (non-exhaustive):

47 RSS kaynağı izleniyor; bazıları (tam liste değil):

- **Krebs on Security** (`krebsonsecurity.com/feed/`)
- **The Hacker News** (`thehackernews.com/rss.xml`)
- **Bleeping Computer** (`bleepingcomputer.com/feed/`)
- **Dark Reading** (`darkreading.com/rss.xml`)
- **Schneier on Security** (`schneier.com/feed/`)
- **SANS Internet Storm Center** (`isc.sans.edu/rssfeed_full.xml`)
- **US-CERT Alerts** (`us-cert.cisa.gov/ncas/alerts.xml`)
- **CISA Cybersecurity Advisories** (`cisa.gov/cybersecurity-advisories.xml`)
- **NCSC-NL (Netherlands)** (`ncsc.nl/actueel/advisories`)
- **BSI (Germany)** (`bsi.bund.de/SiteGlobals/Functions/RSSFeed`)
- **TR-CERT** (`usom.gov.tr/rss/`)
- And ~35 more — see `collector/collect-rss.ts` for the full list.
- Ve ~35 tane daha — tam listesi için `collector/collect-rss.ts` bakın.

### Academic / Research

| Source | URL | Purpose / Amaç |
|--------|-----|----------------|
| **arXiv cs.CR** | `export.arxiv.org/rss/cs.CR` | Cryptography & Security preprints → AI/ML threat lane / Kriptografi ve güvenlik ön baskıları → YZ/ML tehdit şeridi |
| **arXiv cs.AI** | `export.arxiv.org/rss/cs.AI` | AI preprints for AI-threat classification / YZ tehdit sınıflandırması için YZ ön baskıları |

### IoC Pattern Sources (for the classifier itself) / IoC Kalıp Kaynakları (sınıflandırıcının kendisi için)

- **RFC 5735** — IPv4 special-purpose address registry (filter common buckets)
- **IANA TLD list** — top-level domain registry
- **Public suffix list** — Mozilla Public Suffix List
- **Common false-positive regex corpus** — accumulated from production noise

**EN:** All listed sources are used in accordance with their respective terms of service, rate limits, and license requirements. The platform is intentionally read-only with respect to these sources; it never writes back to them.

**TR:** Listelenen tüm kaynaklar, kendi hizmet şartlarına, hız sınırlarına ve lisans gereksinimlerine uygun şekilde kullanılır. Platform bu kaynaklara karşı bilinçli olarak salt-okunurdur; onlara asla geri yazmaz.

---

## 📖 Documentation / Dokümantasyon

**EN:** All process documents live in [`docs/`](docs/) and are referenced from the code. They are in Turkish because the team is bilingual TR/EN, but the code comments and identifiers are English.

**TR:** Tüm süreç dokümanları [`docs/`](docs/) altında bulunur ve koddan referans verilir. Ekip iki dilli (TR/EN) olduğu için Türkçe yazılmıştır, ancak kod yorumları ve tanımlayıcılar İngilizcedir.

| Document / Doküman | What it covers / İçerik |
|--------------------|------------------------|
| [`docs/system-report-2026-08-17.md`](docs/system-report-2026-08-17.md) | Comprehensive system status report — container health, worker pipeline, schema stats, recent changes / Kapsamlı sistem durum raporu — konteyner sağlığı, işçi hattı, şema istatistikleri, son değişiklikler |
| [`docs/audit-2026-08-14.md`](docs/audit-2026-08-14.md) | Site-wide audit: broken links, missing data, SEO gaps, layout issues / Site geneli denetim: kırık linkler, eksik veri, SEO boşlukları, yerleşim sorunları |
| [`docs/production-runbook.md`](docs/production-runbook.md) | Smoke / audit runbook — read-only test infrastructure to catch regressions in production / Üretimde regresyonları yakalayan salt-okunur test altyapısı |
| [`docs/monitoring-runbook.md`](docs/monitoring-runbook.md) | Monitoring & alert runbook — alarm severity, state path, fingerprint, cooldown / İzleme ve alarm kılavuzu — alarm şiddeti, durum yolu, parmak izi, soğuma |
| [`docs/product-roadmap-2026-q4.md`](docs/product-roadmap-2026-q4.md) | Original Q4 roadmap — what was completed (Ö1-Ö10) / Orijinal Q4 yol haritası — tamamlananlar (Ö1-Ö10) |
| [`docs/product-roadmap-v2-2026-q4.md`](docs/product-roadmap-v2-2026-q4.md) | v2 — deeper actor matching, MITRE graph expansion / v2 — daha derin aktör eşleştirme, MITRE grafik genişletme |
| [`docs/product-roadmap-v3-2026-q4.md`](docs/product-roadmap-v3-2026-q4.md) | v3 (Z-series) — data quality gap analysis / v3 (Z serisi) — veri kalitesi boşluk analizi |
| [`docs/product-roadmap-v4-2026-q4.md`](docs/product-roadmap-v4-2026-q4.md) | v4 (AA-series) — current status & pending improvements / v4 (AA serisi) — güncel durum ve bekleyen iyileştirmeler |

### Inline JSDoc / Satır İçi JSDoc

**EN:** The collector's TypeScript files carry full JSDoc on every exported function — parameters, return types, side effects, retry semantics, and rate-limit notes. Start with `collector/collect-rss.ts` and `collector/ioc-classifier.ts`.

**TR:** Toplayıcının TypeScript dosyaları, dışa aktarılan her fonksiyon üzerinde tam JSDoc taşır — parametreler, dönüş tipleri, yan etkiler, yeniden deneme anlamları ve hız sınırı notları. `collector/collect-rss.ts` ve `collector/ioc-classifier.ts` ile başlayın.

---

## 🎓 What We Learned / Neler Öğrendik

**EN:** This section captures the engineering and product lessons from building `threats` over the 2026 summer. They are written in first person because they reflect the developer's actual experience.

**TR:** Bu bölüm, 2026 yazı boyunca `threats`'i geliştirirken edinilen mühendislik ve ürün derslerini birinci ağızdan aktarır.

### On Building a Classifier That Doesn't Lie / Yalan Söylemeyen Bir Sınıflandırıcı Kurmak

> **EN:** The first version of the IoC extractor achieved 91% recall and looked great in tests. In production it turned out to also extract `127.0.0.1`, `example.com`, and `0xDEADBEEF` from technical blog posts. The fix was not a better regex — it was a deny-list of "common bucket" strings and a confidence threshold that demands at least two corroborating signals before an IoC is stored. Lesson: production-grade extraction is more about what you filter out than what you match.

> **TR:** IoC çıkarıcısının ilk sürümü testlerde %91 geri çağırma oranı yakaladı ve harika görünüyordu. Üretimde, teknik blog yazılarından `127.0.0.1`, `example.com` ve `0xDEADBEEF` çıkardığı ortaya çıktı. Çözüm daha iyi bir düzenli ifade değildi — "genel kova" dizelerinden oluşan bir reddetme listesi ve bir IoC'nin depolanmadan önce en az iki teyit edici sinyal gerektiren bir güven eşiği idi. Ders: üretim kalitesinde çıkarım, eşleştirdiğinizden çok filtrelediğinizle ilgilidir.

### On Idempotency / Bölünebilirlik Üzerine

> **EN:** The collector runs every six hours. If a run is interrupted (network blip, OOM, container restart) and re-runs, it must not double-count documents or duplicate IoC-document links. We learned this the hard way when our IoC table grew by 3% in a single day after a partial failure. The fix was a `(source_id, external_id)` UNIQUE constraint plus an `ON CONFLICT DO NOTHING` clause everywhere. Every collector script now starts with the same idempotency header — if it doesn't, it's not ready for cron.

> **TR:** Toplayıcı her altı saatte bir çalışır. Bir çalışma kesintiye uğrarsa (ağ kesintisi, OOM, konteyner yeniden başlatma) ve yeniden çalışırsa, dokümanları iki kez saymamalı veya IoC-doküman bağlantılarını çoğaltmamalıdır. Kısmi bir başarısızlıktan sonra IoC tablomuzun tek bir günde %3 büyüdüğünü gördüğümüzde bunu zor yoldan öğrendik. Çözüm, her yerde `(source_id, external_id)` UNIQUE kısıtı ve `ON CONFLICT DO NOTHING` maddesi oldu. Her toplayıcı betiği artık aynı bölünebilirlik başlığıyla başlıyor — başlamıyorsa, cron için hazır değildir.

### On Rate Limits and Retry Budgets / Hız Sınırları ve Yeniden Deneme Bütçeleri Üzerine

> **EN:** NVD allows 5 requests per 30 seconds without an API key. EPSS allows 100 requests per minute. CISA KEV is unlimited but returns 18 MB in one shot. Mixing these into a single 6-hour run without an explicit per-source budget will either get you rate-limited or burn the entire run on retries. We now track a **retry budget** per source: total wall-clock time across all attempts must fit in a global cap (default 60s), and each attempt has its own timeout. The `f13aea6` commit ("ortak toplam bütçe + per-attempt timeout + Retry-After") is the result of three days of debugging this.

> **TR:** NVD, API anahtarı olmadan 30 saniyede 5 isteğe izin verir. EPSS dakikada 100 isteğe izin verir. CISA KEV sınırsızdır ama tek seferde 18 MB döner. Bunları, kaynak başına açık bir bütçe olmadan tek bir 6 saatlik çalışmaya karıştırmak ya hız sınırına takılmanıza ya da tüm çalışmayı yeniden denemelerle harcamaya yol açar. Artık kaynak başına bir **yeniden deneme bütçesi** takip ediyoruz: tüm denemelerdeki toplam duvar saati süresi genel bir sınıra (varsayılan 60s) sığmalı ve her denemenin kendi zaman aşımı olmalıdır. `f13aea6` commit'i ("ortak toplam bütçe + per-attempt timeout + Retry-After") bunu üç günlük hata ayıklamanın sonucudur.

### On Determinism / Belirleyicilik Üzerine

> **EN:** Using a hosted LLM for the on-host summary would have been faster to ship, but it would have made every refresh of the dashboard potentially show different summaries for the same document. That's bad for reviewability and bad for cacheability. By running the summarizer locally and pinning the model, every `summary` field in the database is reproducible from the same input. Reviewers can diff yesterday's digest against today's and trust that any change is in the source, not in the model.

> **TR:** Konak-üsti özet için barındırılan bir LLM kullanmak, yayına almayı hızlandırırdı, ancak her panoyu yenilemenin aynı doküman için potansiyel olarak farklı özetler göstermesine yol açardı. Bu, incelenebilirlik ve önbelleğe alınabilirlik için kötüdür. Özetleyiciyi yerelde çalıştırıp modeli sabitleyerek, veritabanındaki her `summary` alanı aynı girdiden tekrarlanabilir. İnceleyenler, dünün özetini bugünün özetiyle karşılaştırabilir ve değişikliğin kaynakta değil modelde olduğuna güvenebilir.

### On Operations as a Product Feature / Operasyonu Ürün Özelliği Olarak Görmek

> **EN:** The most-requested feature during internal demos was never a new dashboard. It was "tell me when something is wrong." The monitoring runbook (`docs/monitoring-runbook.md`) and the production-monitor script came out of that. The first version fired 14 alerts on a quiet Sunday because every check ran in isolation; the second version introduced **fingerprinting + cooldown** so the same alarm isn't re-fired for 30 minutes. We learned that an alert system is only as good as the silence it keeps.

> **TR:** Dahili demolarda en çok istenen özellik hiçbir zaman yeni bir pano olmadı. "Bir şeyler yanlış olduğunda bana söyle" idi. İzleme kılavuzu (`docs/monitoring-runbook.md`) ve üretim izleme betiği bundan çıktı. İlk sürüm, sakin bir Pazar gününde 14 alarm üretti çünkü her kontrol izole çalışıyordu; ikinci sürüm, aynı alarmın 30 dakika boyunca yeniden tetiklenmemesi için **parmak izi + soğuma** getirdi. Bir alarm sisteminin, ancak koruduğu sessizlik kadar iyi olduğunu öğrendik.

### On Bilingual Documentation / İki Dilli Dokümantasyon Üzerine

> **EN:** We tried (1) English-only docs and (2) Turkish-only docs before settling on bilingual. The first excluded the team; the second excluded future contributors. The rule we now follow: **code, identifiers, commit messages → English. Process docs, runbooks, runbook examples → Turkish if the audience is the team, English if the audience is external.** This README is English because it ships with the repo; `docs/` is Turkish because the team writes them.

> **TR:** İki dilli çözümüne yerleşmeden önce (1) sadece İngilizce ve (2) sadece Türkçe dokümanları denedik. Birincisi ekibi dışladı; ikincisi gelecekteki katkıda bulunanları dışladı. Artık izlediğimiz kural: **kod, tanımlayıcılar, commit mesajları → İngilizce. Süreç dokümanları, kılavuzlar, kılavuz örnekleri → izleyici ekip ise Türkçe, izleyici dışarısı ise İngilizce.** Bu README repo ile birlikte geldiği için İngilizce; `docs/` ekip tarafından yazıldığı için Türkçe.

---

## 🧪 Testing & Operations / Test ve Operasyon

Production-grade smoke / audit / monitor infrastructure is included out of the box:

Üretim kalitesinde smoke / audit / monitor altyapısı kutudan çıktığı gibi gelir:

```bash
# Unit & integration tests / Birim ve entegrasyon testleri
npm test
npm run test:smoke       # production smoke test
npm run test:monitor     # monitor health
npm run test:health      # health endpoints
npm run test:retry       # HTTP retry layer

# Manual smoke / audit / Manuel smoke / audit
npm run smoke
npm run audit            # read-only production audit
npm run monitor:check    # one-shot monitor
npm run monitor:dry-run  # monitor without alerting
```

The collector has its own backfill tooling for cold-start scenarios (`backfill-runner.ts`, `backfill-daily-stats.ts`, `backfill-doc-iocs.ts`, `content-backfill.ts`).

Toplayıcının soğuk başlangıç senaryoları için kendi backfill araçları vardır (`backfill-runner.ts`, `backfill-daily-stats.ts`, `backfill-doc-iocs.ts`, `content-backfill.ts`).

---

## 🔐 Security Posture / Güvenlik Duruşu

- **Origin guard / Kaynak koruması:** Cloudflare Tunnel binds origin to `127.0.0.1:27100`. No public port other than 443. / Cloudflare Tüneli kaynağı `127.0.0.1:27100`'e bağlar. 443 dışında halka açık port yok.
- **Memory limits / Bellek sınırları:** `app` 512 MB, `worker` 256 MB, `postgres` 256 MB, `redis` 256 MB.
- **Healthchecks:** every service. Worker runs `production-monitor.mjs` as a watchdog. / Her servis. İşçi watchdog olarak `production-monitor.mjs` çalıştırır.
- **Secrets / Sırlar:** `.env` is gitignored; `POSTGRES_PASSWORD` must be set before first run. / `.env` gitignored'dadır; ilk çalıştırmadan önce `POSTGRES_PASSWORD` ayarlanmalıdır.
- **No external LLM at inference time. / Çıkarım zamanında harici LLM yok.** The summarization model runs locally. / Özetleme modeli yerelde çalışır.
- **Read-only audit mode / Salt-okunur denetim kipi:** `npm run audit` produces an evidence report without writing. / `npm run audit` yazmadan bir kanıt raporu üretir.

---

## 📜 License / Lisans

MIT — see [LICENSE](LICENSE).

---

## 🙏 Acknowledgements / Teşekkürler

Built as a capstone for the **Microsoft Summer School Internship Program (2026)** under the *"Building Your First Local RAG Application with Foundry Local"* track. The on-device classifier idea grew out of that brief — taking "local" to its logical conclusion by running the entire pipeline (collection, classification, summarization, serving) on a single self-hosted VM, with the only external hop being the Cloudflare edge in front of it.

*Microsoft Yaz Okulu Staj Programı (2026) kapsamında, "Foundry Local ile İlk Yerel RAG Uygulamanızı Kurmak" başlığı altında bitirme projesi olarak geliştirilmiştir. Cihaz üzerinde sınıflandırıcı fikri, "yerel" kavramını mantıksal sonucuna götürerek tüm hattı (toplama, sınıflandırma, özetleme, sunma) tek bir kendi-konaklı VM üzerinde çalıştırmak ve dışarıya sadece önündeki Cloudflare kenarına giden tünel olarak bırakmak şeklinde o briefden doğmuştur.*

Public sources consumed / Tüketilen halka açık kaynaklar (a non-exhaustive list / tam olmayan bir liste):
- **NVD** — `https://services.nvd.nist.gov/rest/json/cves/2.0`
- **CISA KEV** — `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`
- **FIRST EPSS** — `https://api.first.org/data/v1/epss`
- **MITRE ATT&CK** — `https://cti-taxii.mitre.org/`
- **MITRE CAPEC** — `https://capec.mitre.org/`
- **OSV.dev** — `https://api.osv.dev/v1/query`
- **GitHub Security Advisories** — `https://api.github.com/advisories`
- **abuse.ch** family — URLhaus, Feodo Tracker, ThreatFox, MalwareBazaar, SSLBL
- **PhishTank** — public CSV
- **OpenPhish** — `https://openphish.com/feed.txt`
- **Spamhaus DROP** — `https://www.spamhaus.org/drop/`
- **arXiv** cs.CR / cs.AI — for AI/ML threat separation / YZ/ML tehdit ayrımı için

---

**Maintainer / Bakımcı:** [sametyilmaztemel](https://github.com/sametyilmaztemel) · **Live demo / Canlı demo:** <https://threats.0rce.com>
