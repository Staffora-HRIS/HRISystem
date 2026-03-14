#!/bin/bash
# =============================================================================
# Staffora Database Backup Script
# =============================================================================
#
# Usage:
#   ./backup-db.sh                     # Backup to docker/backups/
#   ./backup-db.sh /path/to/dir        # Backup to custom directory
#   BACKUP_RETENTION_DAYS=30 ./backup-db.sh  # Custom retention (default: 7)
#
# Automated via cron:
#   0 2 * * * /path/to/backup-db.sh >> /var/log/staffora-backup.log 2>&1
# =============================================================================

set -euo pipefail

# Configuration
BACKUP_DIR="${1:-$(dirname "$0")/../backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CONTAINER_NAME="staffora-postgres"
DB_NAME="${POSTGRES_DB:-hris}"
DB_USER="${POSTGRES_USER:-hris}"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/staffora_${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[$(date -Iseconds)] Starting database backup..."
echo "  Database: $DB_NAME"
echo "  Container: $CONTAINER_NAME"
echo "  Output: $BACKUP_FILE"

# Run pg_dump inside the container and compress
if docker exec "$CONTAINER_NAME" pg_dump \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --format=plain \
  --schema=app \
  --schema=public \
  2>/dev/null | gzip > "$BACKUP_FILE"; then

  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[$(date -Iseconds)] Backup completed successfully: $BACKUP_FILE ($BACKUP_SIZE)"
else
  echo "[$(date -Iseconds)] ERROR: Backup failed!" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Verify backup is not empty
if [ ! -s "$BACKUP_FILE" ]; then
  echo "[$(date -Iseconds)] ERROR: Backup file is empty!" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Clean up old backups
echo "[$(date -Iseconds)] Removing backups older than $RETENTION_DAYS days..."
DELETED=$(find "$BACKUP_DIR" -name "staffora_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete -print | wc -l)
echo "  Removed $DELETED old backup(s)"

# List current backups
echo "[$(date -Iseconds)] Current backups:"
ls -lh "$BACKUP_DIR"/staffora_*.sql.gz 2>/dev/null || echo "  (none)"

echo "[$(date -Iseconds)] Backup complete."
