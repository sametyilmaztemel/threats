#!/bin/bash
# threats.0rce.com — collector otomasyonu
# Compose worker servisinden çağrılır (scripts/collect.sh içinde container'da çalışır).
# Manuel: docker exec threats-worker sh /scripts/collect.sh
set -e

cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] RSS collector başlıyor..."
npx tsx collect-rss.ts || echo "RSS hata (devam)"

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] IOC collector başlıyor..."
npx tsx collect-ioc.ts || echo "IOC hata (devam)"

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] GHSA advisory collector başlıyor..."
cd /app && npx tsx collect-advisories.ts || echo "advisories hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] MITRE ATT&CK STIX collector başlıyor (haftalık)..."
if [ -f /app/collect-stix.ts ]; then
  cd /app && npx tsx collect-stix.ts || echo "stix hata (devam)"
  cd /app/collector
else
  echo "collect-stix.ts yok — atlandı"
fi

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] CVE collector başlıyor (varsa)..."
if [ -f collect-cve.ts ]; then
  npx tsx collect-cve.ts || echo "CVE hata (devam)"
else
  echo "collect-cve.ts yok — atlandı"
fi

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Collector tamam."

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Tam metin çekici başlıyor (short docs)..."
cd /app && npx tsx fetch-fulltext.ts || echo "fulltext hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] IOC-doküman eşleştirme başlıyor..."
cd /app && npx tsx link-iocs.ts || echo "link-iocs hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Aktör-doküman eşleştirme (aliases) başlıyor..."
cd /app && npx tsx link-actors.ts || echo "link-actors hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] İçerik backfill başlıyor (aktör/teknik/AI/CVE)..."
if [ -f /app/content-backfill.ts ]; then
  cd /app && npx tsx content-backfill.ts >> /tmp/content-backfill.log 2>&1 || echo "backfill hata (devam)"
  cd /app/collector
else
  echo "content-backfill.ts yok — atlandı"
fi

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Günlük rapor üretiliyor..."
cd /app && REPORT_PERIOD=daily REPORT_DIR=/app/reports npx tsx generate-report.ts || echo "rapor hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Kritik olay alert kontrolü..."
cd /app && npx tsx alert-webhook.ts || echo "alert hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] EPSS + CISA KEV enrichment..."
cd /app && npx tsx enrich-epss-kev.ts >> /tmp/epss-kev.log 2>&1 || echo "epss-kev hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Ölü feed tespiti..."
cd /app && npx tsx dead-feed-alert.ts || echo "dead-feed hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Kalite skoru hesaplama..."
cd /app && npx tsx quality-score.ts || echo "quality hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Haftalık bülten kontrolü (Pazar)..."
cd /app && npx tsx email-newsletter.ts || echo "newsletter hata (devam)"
cd /app/collector
echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Graf edge'leri güncelleniyor..."
cd /app && npx tsx build-graph.ts || echo "build-graph hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] CVE-doküman eşleştirme..."
cd /app && npx tsx link-cves.ts || echo "link-cves hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Günlük snapshot..."
cd /app && npx tsx daily-stats.ts || echo "daily-stats hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] MISP/STIX push (opsiyonel)..."
cd /app && REPORT_DIR=/app/reports npx tsx push-misp.ts || echo "push-misp hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] LLM özet (opsiyonel)..."
cd /app && npx tsx llm-summary.ts || echo "llm-summary hata (devam)"
cd /app/collector

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backfill tamam."
