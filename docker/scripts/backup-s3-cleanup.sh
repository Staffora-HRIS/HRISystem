#!/bin/bash
# =============================================================================
# Staffora S3 Backup Retention Cleanup
# =============================================================================
#
# Enforces the tiered retention policy on S3 backups:
#   - daily/   -> keep for 30 days
#   - weekly/  -> keep for 90 days
#   - monthly/ -> keep for 365 days (1 year)
#
# Usage:
#   ./backup-s3-cleanup.sh
#   S3_BACKUP_BUCKET=my-bucket ./backup-s3-cleanup.sh
#   S3_BACKUP_DRY_RUN=true ./backup-s3-cleanup.sh   # Preview only, no deletes
#
# Automated via cron (run daily after backup):
#   30 2 * * * /path/to/backup-s3-cleanup.sh >> /var/log/staffora-backup.log 2>&1
#
# Required env vars:
#   S3_BACKUP_BUCKET        - S3 bucket name
#   AWS_DEFAULT_REGION      - AWS region (default: eu-west-2)
#   AWS_ACCESS_KEY_ID       - AWS credentials
#   AWS_SECRET_ACCESS_KEY   - AWS credentials
#
# Optional env vars:
#   S3_BACKUP_PREFIX        - Key prefix (default: backups/staffora/)
#   S3_BACKUP_DRY_RUN       - Set to "true" to preview deletes without removing
#   S3_DAILY_RETENTION      - Days to keep daily backups (default: 30)
#   S3_WEEKLY_RETENTION     - Days to keep weekly backups (default: 90)
#   S3_MONTHLY_RETENTION    - Days to keep monthly backups (default: 365)
# =============================================================================

set -euo pipefail

# Configuration
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-}"
S3_BACKUP_PREFIX="${S3_BACKUP_PREFIX:-backups/staffora/}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-eu-west-2}"
DRY_RUN="${S3_BACKUP_DRY_RUN:-false}"

DAILY_RETENTION="${S3_DAILY_RETENTION:-30}"
WEEKLY_RETENTION="${S3_WEEKLY_RETENTION:-90}"
MONTHLY_RETENTION="${S3_MONTHLY_RETENTION:-365}"

if [ -z "$S3_BACKUP_BUCKET" ]; then
  echo "[$(date -Iseconds)] ERROR: S3_BACKUP_BUCKET is not set." >&2
  exit 1
fi

if ! command -v aws &> /dev/null; then
  echo "[$(date -Iseconds)] ERROR: AWS CLI not found." >&2
  exit 1
fi

echo "[$(date -Iseconds)] Starting S3 backup retention cleanup..."
echo "  Bucket: s3://${S3_BACKUP_BUCKET}/${S3_BACKUP_PREFIX}"
echo "  Retention: daily=${DAILY_RETENTION}d, weekly=${WEEKLY_RETENTION}d, monthly=${MONTHLY_RETENTION}d"
if [ "$DRY_RUN" = "true" ]; then
  echo "  MODE: DRY RUN (no files will be deleted)"
fi

# ---------------------------------------------------------------------------
# Helper: delete S3 objects older than N days in a given prefix
# ---------------------------------------------------------------------------
cleanup_tier() {
  local TIER_NAME="$1"
  local TIER_PREFIX="${S3_BACKUP_PREFIX}${TIER_NAME}/"
  local RETENTION_DAYS="$2"
  local CUTOFF_EPOCH
  CUTOFF_EPOCH=$(date -d "-${RETENTION_DAYS} days" +%s 2>/dev/null || date -v-${RETENTION_DAYS}d +%s 2>/dev/null)

  echo ""
  echo "[$(date -Iseconds)] Cleaning ${TIER_NAME} tier (retention: ${RETENTION_DAYS} days)..."
  echo "  Prefix: ${TIER_PREFIX}"

  local DELETED_COUNT=0

  # List objects in the tier
  aws s3api list-objects-v2 \
    --bucket "$S3_BACKUP_BUCKET" \
    --prefix "$TIER_PREFIX" \
    --region "$AWS_DEFAULT_REGION" \
    --query "Contents[].{Key: Key, LastModified: LastModified}" \
    --output text 2>/dev/null | while IFS=$'\t' read -r KEY LAST_MODIFIED; do

    # Skip empty results
    if [ -z "$KEY" ] || [ "$KEY" = "None" ]; then
      continue
    fi

    # Parse the LastModified timestamp to epoch
    OBJECT_EPOCH=$(date -d "$LAST_MODIFIED" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$LAST_MODIFIED" +%s 2>/dev/null || echo "0")

    if [ "$OBJECT_EPOCH" -lt "$CUTOFF_EPOCH" ]; then
      if [ "$DRY_RUN" = "true" ]; then
        echo "  [DRY RUN] Would delete: $KEY (modified: $LAST_MODIFIED)"
      else
        echo "  Deleting: $KEY (modified: $LAST_MODIFIED)"
        aws s3 rm "s3://${S3_BACKUP_BUCKET}/${KEY}" \
          --region "$AWS_DEFAULT_REGION" \
          --only-show-errors
      fi
      DELETED_COUNT=$((DELETED_COUNT + 1))
    fi
  done

  echo "  ${TIER_NAME} tier: processed (expired objects removed)"
}

# Run cleanup for each tier
cleanup_tier "daily"   "$DAILY_RETENTION"
cleanup_tier "weekly"  "$WEEKLY_RETENTION"
cleanup_tier "monthly" "$MONTHLY_RETENTION"

echo ""
echo "[$(date -Iseconds)] S3 retention cleanup complete."
