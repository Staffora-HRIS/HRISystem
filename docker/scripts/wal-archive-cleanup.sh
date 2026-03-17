#!/bin/bash
# =============================================================================
# Staffora WAL Archive Cleanup Script
# =============================================================================
#
# Removes archived WAL segments older than the configured retention period.
# Intended to run from the backup sidecar container, which mounts the
# postgres_wal_archive volume at /wal-archive (read-only by default; mount
# read-write if you want the sidecar to perform cleanup, or run this on the
# postgres container which has read-write access).
#
# Usage:
#   ./wal-archive-cleanup.sh                      # Default: 7 days retention
#   WAL_ARCHIVE_RETENTION_DAYS=14 ./wal-archive-cleanup.sh  # Custom retention
#
# =============================================================================

set -euo pipefail

WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/wal-archive}"
RETENTION_DAYS="${WAL_ARCHIVE_RETENTION_DAYS:-7}"

if [ ! -d "$WAL_ARCHIVE_DIR" ]; then
  echo "[$(date -Iseconds)] WAL archive directory not found: $WAL_ARCHIVE_DIR"
  exit 0
fi

echo "[$(date -Iseconds)] Cleaning WAL archive: removing files older than ${RETENTION_DAYS} days..."

DELETED=$(find "$WAL_ARCHIVE_DIR" -maxdepth 1 -type f -name '0*' -mtime +"$RETENTION_DAYS" -delete -print 2>/dev/null | wc -l)

echo "[$(date -Iseconds)] Removed ${DELETED} old WAL segment(s)."

# Report current archive size
ARCHIVE_SIZE=$(du -sh "$WAL_ARCHIVE_DIR" 2>/dev/null | cut -f1)
SEGMENT_COUNT=$(find "$WAL_ARCHIVE_DIR" -maxdepth 1 -type f -name '0*' 2>/dev/null | wc -l)
echo "[$(date -Iseconds)] WAL archive: ${SEGMENT_COUNT} segment(s), ${ARCHIVE_SIZE} total."
