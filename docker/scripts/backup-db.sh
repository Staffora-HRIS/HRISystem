#!/bin/bash
# =============================================================================
# Staffora Database Backup Script
# =============================================================================
#
# Runs in two modes:
#   1. From the host: uses "docker exec" to run pg_dump in the postgres container
#   2. Inside the backup sidecar: connects to postgres over the Docker network
#
# Detection: if PGPASSWORD is set, assumes sidecar mode (network pg_dump).
# Otherwise assumes host mode (docker exec).
#
# Usage:
#   ./backup-db.sh                     # Backup to docker/backups/ (host) or /backups (sidecar)
#   ./backup-db.sh /path/to/dir        # Backup to custom directory
#   BACKUP_RETENTION_DAYS=30 ./backup-db.sh  # Custom retention (default: 7)
#
# S3 offsite backup (set these env vars to enable):
#   S3_BACKUP_BUCKET        - S3 bucket name (required to enable S3 upload)
#   S3_BACKUP_PREFIX        - Key prefix in bucket (default: backups/staffora/)
#   AWS_DEFAULT_REGION      - AWS region (default: eu-west-2)
#   AWS_ACCESS_KEY_ID       - AWS credentials
#   AWS_SECRET_ACCESS_KEY   - AWS credentials
#   S3_BACKUP_STORAGE_CLASS - S3 storage class (default: STANDARD_IA)
#
# Automated via cron:
#   0 2 * * * /path/to/backup-db.sh >> /var/log/staffora-backup.log 2>&1
# =============================================================================

set -euo pipefail

# Configuration
BACKUP_DIR="${1:-$(dirname "$0")/../backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_TAG=$(date +%Y%m%d)
CONTAINER_NAME="staffora-postgres"
DB_NAME="${POSTGRES_DB:-hris}"
DB_USER="${POSTGRES_USER:-hris}"

# S3 configuration
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-}"
S3_BACKUP_PREFIX="${S3_BACKUP_PREFIX:-backups/staffora/}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-eu-west-2}"
S3_BACKUP_STORAGE_CLASS="${S3_BACKUP_STORAGE_CLASS:-STANDARD_IA}"

# Determine execution mode: sidecar (has PGPASSWORD) vs host (uses docker exec)
if [ -n "${PGPASSWORD:-}" ]; then
  EXEC_MODE="sidecar"
  # In sidecar mode, connect to postgres hostname on the Docker network
  PG_HOST="${PG_HOST:-postgres}"
else
  EXEC_MODE="host"
fi

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

BACKUP_FILENAME="staffora_${DB_NAME}_${TIMESTAMP}.sql.gz"
BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILENAME"

echo "[$(date -Iseconds)] Starting database backup (mode: ${EXEC_MODE})..."
echo "  Database: $DB_NAME"
echo "  Output: $BACKUP_FILE"

# ---------------------------------------------------------------------------
# Run pg_dump and compress
# ---------------------------------------------------------------------------
if [ "$EXEC_MODE" = "sidecar" ]; then
  # Sidecar mode: pg_dump is available locally, connect over network
  echo "  Host: $PG_HOST (network)"
  if pg_dump \
    -h "$PG_HOST" \
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
else
  # Host mode: use docker exec to run pg_dump in the postgres container
  echo "  Container: $CONTAINER_NAME (docker exec)"
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
fi

# Verify backup is not empty
if [ ! -s "$BACKUP_FILE" ]; then
  echo "[$(date -Iseconds)] ERROR: Backup file is empty!" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# ---------------------------------------------------------------------------
# SHA256 Checksum
# ---------------------------------------------------------------------------
echo "[$(date -Iseconds)] Computing SHA256 checksum..."
BACKUP_SHA256=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
echo "${BACKUP_SHA256}  ${BACKUP_FILENAME}" > "${BACKUP_FILE}.sha256"
echo "  SHA256: ${BACKUP_SHA256}"
echo "  Saved to: ${BACKUP_FILE}.sha256"

# ---------------------------------------------------------------------------
# Backup Verification (optional, runs weekly or when VERIFY_BACKUP=true)
# ---------------------------------------------------------------------------
VERIFY_BACKUP="${VERIFY_BACKUP:-false}"
VERIFY_BACKUP_DAY="${VERIFY_BACKUP_DAY:-7}"  # 1=Monday ... 7=Sunday
CURRENT_DAY_OF_WEEK=$(date +%u)
VERIFY_SCRIPT="$(dirname "$0")/verify-backup.sh"

if [ "$VERIFY_BACKUP" = "true" ] || [ "$VERIFY_BACKUP" = "always" ]; then
  SHOULD_VERIFY=true
elif [ "$VERIFY_BACKUP" = "weekly" ] && [ "$CURRENT_DAY_OF_WEEK" = "$VERIFY_BACKUP_DAY" ]; then
  SHOULD_VERIFY=true
else
  SHOULD_VERIFY=false
fi

if [ "$SHOULD_VERIFY" = true ] && [ -x "$VERIFY_SCRIPT" ]; then
  echo "[$(date -Iseconds)] Running backup verification..."
  if "$VERIFY_SCRIPT" "$BACKUP_FILE" --checksum "$BACKUP_SHA256"; then
    echo "[$(date -Iseconds)] Backup verification PASSED."
  else
    echo "[$(date -Iseconds)] WARNING: Backup verification FAILED!" >&2
    echo "  The backup file was created but may not restore correctly."
    echo "  Review the verification report above for details."
    # Do not exit with error -- the backup itself was created successfully.
    # The verification failure is reported but does not delete the backup.
  fi
elif [ "$SHOULD_VERIFY" = true ] && [ ! -x "$VERIFY_SCRIPT" ]; then
  echo "[$(date -Iseconds)] WARNING: Verification requested but ${VERIFY_SCRIPT} not found or not executable."
fi

# ---------------------------------------------------------------------------
# S3 Offsite Upload
# ---------------------------------------------------------------------------
if [ -n "$S3_BACKUP_BUCKET" ]; then
  echo "[$(date -Iseconds)] Uploading backup to S3..."
  echo "  Bucket: s3://${S3_BACKUP_BUCKET}"
  echo "  Region: ${AWS_DEFAULT_REGION}"

  # Check that aws CLI is available
  if ! command -v aws &> /dev/null; then
    echo "[$(date -Iseconds)] ERROR: AWS CLI not found. Install it to enable S3 backups." >&2
    echo "  Local backup was saved successfully. Only S3 upload failed."
    # Do not exit with error -- local backup is still valid
  else
    # Determine the S3 key path with tiered structure for retention:
    #   daily/YYYY-MM-DD/filename   -- kept 30 days
    #   weekly/YYYY-WNN/filename    -- kept 90 days (uploaded on Sundays)
    #   monthly/YYYY-MM/filename    -- kept 1 year (uploaded on 1st of month)
    DAY_OF_WEEK=$(date +%u)   # 1=Monday ... 7=Sunday
    DAY_OF_MONTH=$(date +%d)  # 01-31
    YEAR_MONTH=$(date +%Y-%m)
    YEAR_WEEK=$(date +%Y-W%V)

    S3_DAILY_KEY="${S3_BACKUP_PREFIX}daily/${DATE_TAG}/${BACKUP_FILENAME}"

    # Always upload to daily tier
    echo "[$(date -Iseconds)] Uploading to daily tier: ${S3_DAILY_KEY}"
    if aws s3 cp "$BACKUP_FILE" "s3://${S3_BACKUP_BUCKET}/${S3_DAILY_KEY}" \
      --sse AES256 \
      --storage-class "$S3_BACKUP_STORAGE_CLASS" \
      --region "$AWS_DEFAULT_REGION" \
      --only-show-errors; then
      echo "[$(date -Iseconds)] S3 daily upload successful."
    else
      echo "[$(date -Iseconds)] ERROR: S3 daily upload failed!" >&2
      echo "  Local backup was saved successfully. Only S3 upload failed."
    fi

    # On Sundays, also upload to weekly tier
    if [ "$DAY_OF_WEEK" = "7" ]; then
      S3_WEEKLY_KEY="${S3_BACKUP_PREFIX}weekly/${YEAR_WEEK}/${BACKUP_FILENAME}"
      echo "[$(date -Iseconds)] Uploading to weekly tier: ${S3_WEEKLY_KEY}"
      if aws s3 cp "$BACKUP_FILE" "s3://${S3_BACKUP_BUCKET}/${S3_WEEKLY_KEY}" \
        --sse AES256 \
        --storage-class "$S3_BACKUP_STORAGE_CLASS" \
        --region "$AWS_DEFAULT_REGION" \
        --only-show-errors; then
        echo "[$(date -Iseconds)] S3 weekly upload successful."
      else
        echo "[$(date -Iseconds)] ERROR: S3 weekly upload failed!" >&2
      fi
    fi

    # On 1st of the month, also upload to monthly tier
    if [ "$DAY_OF_MONTH" = "01" ]; then
      S3_MONTHLY_KEY="${S3_BACKUP_PREFIX}monthly/${YEAR_MONTH}/${BACKUP_FILENAME}"
      echo "[$(date -Iseconds)] Uploading to monthly tier: ${S3_MONTHLY_KEY}"
      if aws s3 cp "$BACKUP_FILE" "s3://${S3_BACKUP_BUCKET}/${S3_MONTHLY_KEY}" \
        --sse AES256 \
        --storage-class STANDARD_IA \
        --region "$AWS_DEFAULT_REGION" \
        --only-show-errors; then
        echo "[$(date -Iseconds)] S3 monthly upload successful."
      else
        echo "[$(date -Iseconds)] ERROR: S3 monthly upload failed!" >&2
      fi
    fi
  fi
else
  echo "[$(date -Iseconds)] S3 upload skipped (S3_BACKUP_BUCKET not set)."
fi

# ---------------------------------------------------------------------------
# Local Cleanup
# ---------------------------------------------------------------------------
echo "[$(date -Iseconds)] Removing local backups older than $RETENTION_DAYS days..."
DELETED=$(find "$BACKUP_DIR" -name "staffora_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete -print | wc -l)
echo "  Removed $DELETED old backup(s)"

# List current local backups
echo "[$(date -Iseconds)] Current local backups:"
ls -lh "$BACKUP_DIR"/staffora_*.sql.gz 2>/dev/null || echo "  (none)"

echo "[$(date -Iseconds)] Backup complete."
