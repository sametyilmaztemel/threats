#!/bin/bash
# threats.0rce.com — backup script
# Kullanım: ./scripts/backup.sh  → backups/threats_YYYYMMDD_HHMM.dump
# Off-site kopya için: ./scripts/backup.sh /path/to/offsite  (opsiyonel argüman)
set -e

BACKUP_DIR="${1:-backups}"
mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d_%H%M)
DUMP="$BACKUP_DIR/threats_${TS}.dump"

echo "==> PostgreSQL dump: $DUMP"
docker exec threats-postgres pg_dump -U threats -d threats --format=custom -f /tmp/t.dump
docker cp threats-postgres:/tmp/t.dump "$DUMP"
docker exec threats-postgres rm -f /tmp/t.dump

echo "==> Redis save (BGSAVE trigger)"
docker exec threats-redis redis-cli save > /dev/null

echo "==> Boyut: $(du -h "$DUMP" | cut -f1)"
echo "==> Backup tamam: $DUMP"

# Son 14 günlük backup'ı tut, eskiyi sil
find "$BACKUP_DIR" -name "threats_*.dump" -mtime +14 -delete 2>/dev/null || true
