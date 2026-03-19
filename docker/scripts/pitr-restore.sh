#!/bin/bash
# =============================================================================
# Staffora Point-in-Time Recovery (PITR) Script
# =============================================================================
#
# Restores the PostgreSQL database to a specific point in time using a base
# backup (pg_dump) and archived WAL segments.
#
# Usage:
#   ./pitr-restore.sh --target-time "2026-03-19 14:30:00 UTC"
#   ./pitr-restore.sh --latest
#   ./pitr-restore.sh --dry-run --target-time "2026-03-19 14:30:00 UTC"
#
# See Docs/operations/point-in-time-recovery.md for the full procedure.
# =============================================================================

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
BACKUP_DIR="/backups"
WAL_ARCHIVE_DIR="/wal-archive"
DATA_DIR="/var/lib/postgresql/data"
DB_NAME="${POSTGRES_DB:-hris}"
DB_USER="${POSTGRES_USER:-hris}"

TARGET_TIME=""
TARGET_LATEST=false
BACKUP_FILE=""
DRY_RUN=false
SKIP_CONFIRM=false
