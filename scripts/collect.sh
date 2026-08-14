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

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] İçerik backfill başlıyor (aktör/teknik/AI/CVE)..."
if [ -f /app/content-backfill.ts ]; then
  cd /app && npx tsx content-backfill.ts >> /tmp/content-backfill.log 2>&1 || echo "backfill hata (devam)"
  cd /app/collector
else
  echo "content-backfill.ts yok — atlandı"
fi
echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backfill tamam."
