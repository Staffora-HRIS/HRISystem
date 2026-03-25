#!/bin/bash
# =============================================================================
# PostgreSQL Entrypoint Wrapper
# =============================================================================
# Fixes WAL archive directory permissions before delegating to the official
# postgres entrypoint. This runs as root (the default user in the postgres
# Docker image), so it can chown the mounted volume directory.
# =============================================================================

set -e

# Fix WAL archive directory ownership so postgres (UID 999) can write to it
if [ -d /wal-archive ]; then
  chown postgres:postgres /wal-archive
fi

# Delegate to the official postgres entrypoint
exec docker-entrypoint.sh "$@"
