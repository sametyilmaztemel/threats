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

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] CVE collector başlıyor (varsa)..."
if [ -f collect-cve.ts ]; then
  npx tsx collect-cve.ts || echo "CVE hata (devam)"
else
  echo "collect-cve.ts yok — atlandı"
fi

echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Collector tamam."
