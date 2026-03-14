#!/bin/bash
# =============================================================================
# Staffora Database Restore Script
# =============================================================================
#
# Usage:
#   ./restore-db.sh path/to/backup.sql.gz
#
# WARNING: This will DROP and recreate the app schema. All current data will
# be lost. Make sure you have a backup of the current state first.
# =============================================================================

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  echo ""
  echo "Available backups:"
  ls -lh "$(dirname "$0")/../backups"/staffora_*.sql.gz 2>/dev/null || echo "  (none found in docker/backups/)"
  exit 1
fi

BACKUP_FILE="$1"
CONTAINER_NAME="staffora-postgres"
DB_NAME="${POSTGRES_DB:-hris}"
DB_USER="${POSTGRES_USER:-hris}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "=============================================="
echo " WARNING: This will DESTROY all current data"
echo " Database: $DB_NAME"
echo " Backup: $BACKUP_FILE"
echo "=============================================="
echo ""
read -p "Are you sure? Type 'yes' to continue: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo "[$(date -Iseconds)] Starting restore from $BACKUP_FILE..."

# Decompress and pipe into psql
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --set ON_ERROR_STOP=on \
  2>&1

if [ $? -eq 0 ]; then
  echo "[$(date -Iseconds)] Restore completed successfully."
else
  echo "[$(date -Iseconds)] ERROR: Restore failed!" >&2
  exit 1
fi
