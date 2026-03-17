#!/bin/bash
# =============================================================================
# Staffora Database Restore from S3
# =============================================================================
#
# Downloads a backup from S3 and restores it to the local PostgreSQL instance.
#
# Usage:
#   ./restore-from-s3.sh <s3-key>                # Restore specific backup by key
#   ./restore-from-s3.sh --list                   # List available S3 backups
#   ./restore-from-s3.sh --list daily             # List daily backups only
#   ./restore-from-s3.sh --list weekly            # List weekly backups only
#   ./restore-from-s3.sh --list monthly           # List monthly backups only
#   ./restore-from-s3.sh --latest                 # Restore the most recent daily backup
#   ./restore-from-s3.sh --latest weekly          # Restore the most recent weekly backup
#
# Required env vars:
#   S3_BACKUP_BUCKET        - S3 bucket name
#   AWS_DEFAULT_REGION      - AWS region (default: eu-west-2)
#   AWS_ACCESS_KEY_ID       - AWS credentials
#   AWS_SECRET_ACCESS_KEY   - AWS credentials
#
# Optional env vars:
#   S3_BACKUP_PREFIX        - Key prefix (default: backups/staffora/)
#   POSTGRES_DB             - Database name (default: hris)
#   POSTGRES_USER           - Database user (default: hris)
#
# WARNING: This will DROP and recreate the app schema. All current data will
# be lost. Make sure you have a backup of the current state first.
# =============================================================================

set -euo pipefail

# Configuration
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-}"
S3_BACKUP_PREFIX="${S3_BACKUP_PREFIX:-backups/staffora/}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-eu-west-2}"
CONTAINER_NAME="staffora-postgres"
DB_NAME="${POSTGRES_DB:-hris}"
DB_USER="${POSTGRES_USER:-hris}"
TEMP_DIR="${TMPDIR:-/tmp}/staffora-restore"

# Validate prerequisites
if [ -z "$S3_BACKUP_BUCKET" ]; then
  echo "ERROR: S3_BACKUP_BUCKET environment variable is not set." >&2
  echo ""
  echo "Set it before running this script:"
  echo "  export S3_BACKUP_BUCKET=your-bucket-name"
  exit 1
fi

if ! command -v aws &> /dev/null; then
  echo "ERROR: AWS CLI not found. Install it first:" >&2
  echo "  https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# List available backups
# ---------------------------------------------------------------------------
list_backups() {
  local TIER="${1:-}"
  local PREFIX="$S3_BACKUP_PREFIX"

  if [ -n "$TIER" ]; then
    PREFIX="${S3_BACKUP_PREFIX}${TIER}/"
  fi

  echo "Available backups in s3://${S3_BACKUP_BUCKET}/${PREFIX}"
  echo "---"

  aws s3api list-objects-v2 \
    --bucket "$S3_BACKUP_BUCKET" \
    --prefix "$PREFIX" \
    --region "$AWS_DEFAULT_REGION" \
    --query "Contents[?ends_with(Key, '.sql.gz')].{Key: Key, Size: Size, LastModified: LastModified}" \
    --output table 2>/dev/null || echo "(no backups found)"
}

# ---------------------------------------------------------------------------
# Get the latest backup key from a tier
# ---------------------------------------------------------------------------
get_latest_key() {
  local TIER="${1:-daily}"
  local PREFIX="${S3_BACKUP_PREFIX}${TIER}/"

  aws s3api list-objects-v2 \
    --bucket "$S3_BACKUP_BUCKET" \
    --prefix "$PREFIX" \
    --region "$AWS_DEFAULT_REGION" \
    --query "sort_by(Contents[?ends_with(Key, '.sql.gz')], &LastModified)[-1].Key" \
    --output text 2>/dev/null
}

# ---------------------------------------------------------------------------
# Download and restore a backup
# ---------------------------------------------------------------------------
restore_backup() {
  local S3_KEY="$1"

  if [ -z "$S3_KEY" ] || [ "$S3_KEY" = "None" ] || [ "$S3_KEY" = "null" ]; then
    echo "ERROR: No backup found to restore." >&2
    exit 1
  fi

  local FILENAME
  FILENAME=$(basename "$S3_KEY")

  echo "=============================================="
  echo " WARNING: This will DESTROY all current data"
  echo " Database: $DB_NAME"
  echo " Source: s3://${S3_BACKUP_BUCKET}/${S3_KEY}"
  echo "=============================================="
  echo ""
  read -p "Are you sure? Type 'yes' to continue: " CONFIRM

  if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
  fi

  # Create temp directory for download
  mkdir -p "$TEMP_DIR"
  local LOCAL_FILE="$TEMP_DIR/$FILENAME"

  echo "[$(date -Iseconds)] Downloading backup from S3..."
  echo "  Source: s3://${S3_BACKUP_BUCKET}/${S3_KEY}"
  echo "  Destination: $LOCAL_FILE"

  if ! aws s3 cp "s3://${S3_BACKUP_BUCKET}/${S3_KEY}" "$LOCAL_FILE" \
    --region "$AWS_DEFAULT_REGION" \
    --only-show-errors; then
    echo "[$(date -Iseconds)] ERROR: Failed to download backup from S3!" >&2
    rm -rf "$TEMP_DIR"
    exit 1
  fi

  # Verify the downloaded file is not empty
  if [ ! -s "$LOCAL_FILE" ]; then
    echo "[$(date -Iseconds)] ERROR: Downloaded file is empty!" >&2
    rm -rf "$TEMP_DIR"
    exit 1
  fi

  DOWNLOAD_SIZE=$(du -h "$LOCAL_FILE" | cut -f1)
  echo "[$(date -Iseconds)] Download complete ($DOWNLOAD_SIZE)"

  echo "[$(date -Iseconds)] Starting restore..."

  # Decompress and pipe into psql
  if gunzip -c "$LOCAL_FILE" | docker exec -i "$CONTAINER_NAME" psql \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --set ON_ERROR_STOP=on \
    2>&1; then
    echo "[$(date -Iseconds)] Restore completed successfully."
  else
    echo "[$(date -Iseconds)] ERROR: Restore failed!" >&2
    rm -rf "$TEMP_DIR"
    exit 1
  fi

  # Clean up temp file
  rm -rf "$TEMP_DIR"
  echo "[$(date -Iseconds)] Temporary files cleaned up."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if [ $# -eq 0 ]; then
  echo "Usage:"
  echo "  $0 <s3-key>              Restore a specific backup by its S3 key"
  echo "  $0 --list [tier]         List available backups (tier: daily, weekly, monthly)"
  echo "  $0 --latest [tier]       Restore the most recent backup (tier: daily, weekly, monthly)"
  echo ""
  echo "Examples:"
  echo "  $0 --list"
  echo "  $0 --list weekly"
  echo "  $0 --latest"
  echo "  $0 --latest monthly"
  echo "  $0 backups/staffora/daily/2026-03-17/staffora_hris_20260317_020000.sql.gz"
  echo ""
  echo "Required environment variables:"
  echo "  S3_BACKUP_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
  exit 1
fi

case "$1" in
  --list)
    list_backups "${2:-}"
    ;;
  --latest)
    TIER="${2:-daily}"
    echo "[$(date -Iseconds)] Finding latest ${TIER} backup..."
    LATEST_KEY=$(get_latest_key "$TIER")
    if [ -z "$LATEST_KEY" ] || [ "$LATEST_KEY" = "None" ] || [ "$LATEST_KEY" = "null" ]; then
      echo "ERROR: No ${TIER} backups found in s3://${S3_BACKUP_BUCKET}/${S3_BACKUP_PREFIX}${TIER}/" >&2
      exit 1
    fi
    echo "  Found: $LATEST_KEY"
    restore_backup "$LATEST_KEY"
    ;;
  *)
    restore_backup "$1"
    ;;
esac
