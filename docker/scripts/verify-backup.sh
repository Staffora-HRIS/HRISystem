#!/bin/bash
# =============================================================================
# Staffora Backup Verification Script
# =============================================================================
#
# Verifies the integrity of a database backup by:
#   1. Calculating and optionally verifying a SHA256 checksum
#   2. Spinning up a temporary PostgreSQL container
#   3. Restoring the backup into it
#   4. Running integrity checks (schema validation, table counts, RLS policies)
#   5. Cleaning up the temp container
#   6. Reporting pass/fail
#
# Usage:
#   ./verify-backup.sh <backup-file.sql.gz>                  # Verify a backup
#   ./verify-backup.sh <backup-file.sql.gz> --save-checksum  # Verify and save SHA256 checksum
#   ./verify-backup.sh <backup-file.sql.gz> --checksum <sha> # Verify against a known checksum
#   ./verify-backup.sh --latest                               # Verify the most recent local backup
#   ./verify-backup.sh --latest --save-checksum               # Verify latest and save checksum
#
# Environment variables:
#   VERIFY_PG_IMAGE     - PostgreSQL image to use (default: postgres:16)
#   VERIFY_PG_PASSWORD  - Password for temp container (default: random)
#   VERIFY_TIMEOUT      - Max seconds to wait for container startup (default: 30)
#   VERIFY_KEEP_CONTAINER - Set to "true" to keep temp container for debugging
#   BACKUP_DIR          - Directory to scan for --latest (default: docker/backups or /backups)
#
# Exit codes:
#   0 - Backup verified successfully
#   1 - Verification failed
#   2 - Invalid arguments or prerequisites missing
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
VERIFY_PG_IMAGE="${VERIFY_PG_IMAGE:-postgres:16}"
VERIFY_PG_PASSWORD="${VERIFY_PG_PASSWORD:-verify_$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
VERIFY_TIMEOUT="${VERIFY_TIMEOUT:-30}"
VERIFY_KEEP_CONTAINER="${VERIFY_KEEP_CONTAINER:-false}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMP_CONTAINER_NAME="staffora-backup-verify-$$"
DB_NAME="hris"
DB_USER="hris"

# Track verification results
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0
RESULTS=()

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
log_info() {
  echo "[$(date -Iseconds)] INFO: $*"
}

log_error() {
  echo "[$(date -Iseconds)] ERROR: $*" >&2
}

log_warn() {
  echo "[$(date -Iseconds)] WARN: $*"
}

record_check() {
  local name="$1"
  local status="$2"
  local detail="${3:-}"
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

  if [ "$status" = "PASS" ]; then
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    RESULTS+=("  [PASS] $name${detail:+ -- $detail}")
  elif [ "$status" = "WARN" ]; then
    WARNINGS=$((WARNINGS + 1))
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    RESULTS+=("  [WARN] $name${detail:+ -- $detail}")
  else
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    RESULTS+=("  [FAIL] $name${detail:+ -- $detail}")
  fi
}

cleanup() {
  if [ "${VERIFY_KEEP_CONTAINER}" = "true" ]; then
    log_info "Keeping temporary container: ${TEMP_CONTAINER_NAME}"
    log_info "  Connect with: docker exec -it ${TEMP_CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME}"
    log_info "  Remove with:  docker rm -f ${TEMP_CONTAINER_NAME}"
    return
  fi

  if docker ps -a --format '{{.Names}}' | grep -q "^${TEMP_CONTAINER_NAME}$" 2>/dev/null; then
    log_info "Cleaning up temporary container: ${TEMP_CONTAINER_NAME}"
    docker rm -f "${TEMP_CONTAINER_NAME}" > /dev/null 2>&1 || true
  fi
}

# Always clean up on exit
trap cleanup EXIT

usage() {
  echo "Usage:"
  echo "  $0 <backup-file.sql.gz>                  Verify a backup file"
  echo "  $0 <backup-file.sql.gz> --save-checksum  Verify and save SHA256 to .sha256 file"
  echo "  $0 <backup-file.sql.gz> --checksum <sha> Verify against a known SHA256"
  echo "  $0 --latest                               Verify the most recent local backup"
  echo ""
  echo "Options:"
  echo "  --save-checksum   Save computed SHA256 to <backup-file>.sha256"
  echo "  --checksum <sha>  Verify file matches expected SHA256 hash"
  echo "  --latest          Find and verify the most recent backup file"
  echo ""
  echo "Environment variables:"
  echo "  VERIFY_PG_IMAGE         PostgreSQL Docker image (default: postgres:16)"
  echo "  VERIFY_TIMEOUT          Container startup timeout in seconds (default: 30)"
  echo "  VERIFY_KEEP_CONTAINER   Keep temp container for debugging (default: false)"
  echo "  BACKUP_DIR              Directory to scan for --latest"
  exit 2
}

find_latest_backup() {
  local search_dirs=()

  if [ -n "${BACKUP_DIR:-}" ]; then
    search_dirs+=("$BACKUP_DIR")
  fi

  # Check common backup locations
  search_dirs+=("${SCRIPT_DIR}/../backups")
  search_dirs+=("/backups")

  for dir in "${search_dirs[@]}"; do
    if [ -d "$dir" ]; then
      local latest
      latest=$(find "$dir" -name "staffora_*.sql.gz" -type f 2>/dev/null | sort -r | head -1)
      if [ -n "$latest" ]; then
        echo "$latest"
        return 0
      fi
    fi
  done

  return 1
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
BACKUP_FILE=""
SAVE_CHECKSUM=false
EXPECTED_CHECKSUM=""

while [ $# -gt 0 ]; do
  case "$1" in
    --latest)
      BACKUP_FILE=$(find_latest_backup || true)
      if [ -z "$BACKUP_FILE" ]; then
        log_error "No backup files found in standard locations."
        log_error "Set BACKUP_DIR or provide an explicit file path."
        exit 2
      fi
      log_info "Found latest backup: $BACKUP_FILE"
      shift
      ;;
    --save-checksum)
      SAVE_CHECKSUM=true
      shift
      ;;
    --checksum)
      if [ -z "${2:-}" ]; then
        log_error "--checksum requires a SHA256 hash value"
        exit 2
      fi
      EXPECTED_CHECKSUM="$2"
      shift 2
      ;;
    --help|-h)
      usage
      ;;
    -*)
      log_error "Unknown option: $1"
      usage
      ;;
    *)
      if [ -z "$BACKUP_FILE" ]; then
        BACKUP_FILE="$1"
      else
        log_error "Unexpected argument: $1"
        usage
      fi
      shift
      ;;
  esac
done

if [ -z "$BACKUP_FILE" ]; then
  log_error "No backup file specified."
  usage
fi

if [ ! -f "$BACKUP_FILE" ]; then
  log_error "Backup file not found: $BACKUP_FILE"
  exit 2
fi

if [ ! -s "$BACKUP_FILE" ]; then
  log_error "Backup file is empty: $BACKUP_FILE"
  exit 2
fi

# Check prerequisites
if ! command -v docker &> /dev/null; then
  log_error "Docker is required but not found in PATH."
  exit 2
fi

if ! docker info > /dev/null 2>&1; then
  log_error "Docker daemon is not running or not accessible."
  exit 2
fi

# ---------------------------------------------------------------------------
# Step 1: File-level checks and SHA256 checksum
# ---------------------------------------------------------------------------
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
BACKUP_BASENAME=$(basename "$BACKUP_FILE")

echo ""
echo "================================================================="
echo "  Staffora Backup Verification"
echo "================================================================="
echo "  File:    $BACKUP_FILE"
echo "  Size:    $BACKUP_SIZE"
echo "  Image:   $VERIFY_PG_IMAGE"
echo "  Timeout: ${VERIFY_TIMEOUT}s"
echo "================================================================="
echo ""

log_info "Step 1/5: Checksum validation..."

# Compute SHA256
COMPUTED_SHA256=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
log_info "  SHA256: ${COMPUTED_SHA256}"

# Verify against expected checksum if provided
if [ -n "$EXPECTED_CHECKSUM" ]; then
  if [ "$COMPUTED_SHA256" = "$EXPECTED_CHECKSUM" ]; then
    record_check "SHA256 checksum matches expected value" "PASS"
  else
    record_check "SHA256 checksum mismatch" "FAIL" "expected=${EXPECTED_CHECKSUM} got=${COMPUTED_SHA256}"
    log_error "Checksum mismatch! Backup may be corrupted or tampered with."
    # Don't exit yet -- continue with other checks to provide full report
  fi
else
  # Check for a .sha256 sidecar file
  SHA256_FILE="${BACKUP_FILE}.sha256"
  if [ -f "$SHA256_FILE" ]; then
    STORED_SHA256=$(awk '{print $1}' "$SHA256_FILE")
    if [ "$COMPUTED_SHA256" = "$STORED_SHA256" ]; then
      record_check "SHA256 checksum matches stored .sha256 file" "PASS"
    else
      record_check "SHA256 checksum mismatch with .sha256 file" "FAIL" "stored=${STORED_SHA256} computed=${COMPUTED_SHA256}"
    fi
  else
    record_check "SHA256 checksum computed (no reference to compare)" "WARN" "sha256=${COMPUTED_SHA256}"
  fi
fi

# Save checksum if requested
if [ "$SAVE_CHECKSUM" = true ]; then
  echo "${COMPUTED_SHA256}  ${BACKUP_BASENAME}" > "${BACKUP_FILE}.sha256"
  log_info "  Checksum saved to: ${BACKUP_FILE}.sha256"
fi

# Verify gzip integrity
log_info "  Verifying gzip integrity..."
if gunzip -t "$BACKUP_FILE" 2>/dev/null; then
  record_check "Gzip archive integrity" "PASS"
else
  record_check "Gzip archive integrity" "FAIL" "File is not a valid gzip archive"
  log_error "Backup file is not a valid gzip archive. Cannot proceed with restore test."
  # Print results and exit
  echo ""
  echo "================================================================="
  echo "  Verification Results"
  echo "================================================================="
  for result in "${RESULTS[@]}"; do
    echo "$result"
  done
  echo ""
  echo "  Total: ${TOTAL_CHECKS} checks, ${PASSED_CHECKS} passed, ${FAILED_CHECKS} failed, ${WARNINGS} warnings"
  echo "================================================================="
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Start temporary PostgreSQL container
# ---------------------------------------------------------------------------
log_info "Step 2/5: Starting temporary PostgreSQL container..."

docker run -d \
  --name "${TEMP_CONTAINER_NAME}" \
  -e POSTGRES_USER="${DB_USER}" \
  -e POSTGRES_PASSWORD="${VERIFY_PG_PASSWORD}" \
  -e POSTGRES_DB="${DB_NAME}" \
  "${VERIFY_PG_IMAGE}" \
  postgres -c fsync=off -c full_page_writes=off -c synchronous_commit=off \
  > /dev/null 2>&1

log_info "  Container: ${TEMP_CONTAINER_NAME}"

# Wait for PostgreSQL to be ready
log_info "  Waiting for PostgreSQL to accept connections (timeout: ${VERIFY_TIMEOUT}s)..."
WAIT_ELAPSED=0
while ! docker exec "${TEMP_CONTAINER_NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" > /dev/null 2>&1; do
  sleep 1
  WAIT_ELAPSED=$((WAIT_ELAPSED + 1))
  if [ "$WAIT_ELAPSED" -ge "$VERIFY_TIMEOUT" ]; then
    record_check "Temporary container startup" "FAIL" "Timed out after ${VERIFY_TIMEOUT}s"
    log_error "Temporary PostgreSQL container failed to start within ${VERIFY_TIMEOUT}s."
    exit 1
  fi
done

record_check "Temporary container startup" "PASS" "Ready in ${WAIT_ELAPSED}s"

# ---------------------------------------------------------------------------
# Step 3: Initialize schema and restore backup
# ---------------------------------------------------------------------------
log_info "Step 3/5: Restoring backup into temporary container..."

# Create the app schema and essential functions (matching docker/postgres/init.sql)
docker exec "${TEMP_CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -q <<'INIT_SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS app;
ALTER DATABASE hris SET search_path TO app, public;
SET search_path TO app, public;

-- Minimal RLS helper functions needed for restore
CREATE OR REPLACE FUNCTION app.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION app.prevent_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Updates are not allowed on this table'; END; $$;

CREATE OR REPLACE FUNCTION app.prevent_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Deletes are not allowed on this table'; END; $$;

CREATE OR REPLACE FUNCTION app.set_tenant_context(p_tenant_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
BEGIN
    PERFORM set_config('app.current_tenant', p_tenant_id::text, true);
    IF p_user_id IS NOT NULL THEN
        PERFORM set_config('app.current_user', p_user_id::text, true);
    END IF;
END; $$;

CREATE OR REPLACE FUNCTION app.is_system_context()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = app, public AS $$
BEGIN RETURN current_setting('app.system_context', true) = 'true'; END; $$;

CREATE OR REPLACE FUNCTION app.enable_system_context()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
BEGIN PERFORM set_config('app.system_context', 'true', true); END; $$;

CREATE OR REPLACE FUNCTION app.disable_system_context()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
BEGIN PERFORM set_config('app.system_context', 'false', true); END; $$;

CREATE OR REPLACE FUNCTION app.generate_short_id(length integer DEFAULT 12)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
result text := ''; i integer;
BEGIN
    FOR i IN 1..length LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION app.is_valid_email(email text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN RETURN email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'; END; $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email') THEN
        CREATE DOMAIN app.email AS text CHECK (app.is_valid_email(VALUE));
    END IF;
END $$;
INIT_SQL

if [ $? -ne 0 ]; then
  record_check "Schema initialization" "FAIL" "Could not create base schema in temp container"
  log_error "Failed to initialize schema. Cannot proceed."
  exit 1
fi

record_check "Schema initialization in temp container" "PASS"

# Restore the backup (suppress expected "already exists" notices from --clean --if-exists)
RESTORE_START=$(date +%s)
RESTORE_OUTPUT=$(gunzip -c "$BACKUP_FILE" | docker exec -i "${TEMP_CONTAINER_NAME}" psql \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --set ON_ERROR_STOP=off \
  -q 2>&1) || true
RESTORE_END=$(date +%s)
RESTORE_DURATION=$((RESTORE_END - RESTORE_START))

# Check for critical restore errors (ignore expected notices about existing objects)
CRITICAL_ERRORS=$(echo "$RESTORE_OUTPUT" | grep -ci "ERROR:" 2>/dev/null || echo "0")
# Filter out benign errors (e.g., "already exists" from --clean --if-exists in backup)
BENIGN_ERRORS=$(echo "$RESTORE_OUTPUT" | grep -ci "already exists\|does not exist, skipping\|current transaction is aborted" 2>/dev/null || echo "0")
REAL_ERRORS=$((CRITICAL_ERRORS - BENIGN_ERRORS))

if [ "$REAL_ERRORS" -le 0 ]; then
  record_check "Backup restore" "PASS" "Completed in ${RESTORE_DURATION}s"
else
  # Show first few real errors for diagnosis
  SAMPLE_ERRORS=$(echo "$RESTORE_OUTPUT" | grep -i "ERROR:" | grep -vi "already exists\|does not exist, skipping" | head -5)
  if [ "$REAL_ERRORS" -le 3 ]; then
    record_check "Backup restore" "WARN" "${REAL_ERRORS} non-critical errors in ${RESTORE_DURATION}s"
  else
    record_check "Backup restore" "FAIL" "${REAL_ERRORS} errors in ${RESTORE_DURATION}s"
  fi
  if [ -n "$SAMPLE_ERRORS" ]; then
    log_warn "  Sample errors:"
    echo "$SAMPLE_ERRORS" | while read -r line; do
      echo "    $line"
    done
  fi
fi

# ---------------------------------------------------------------------------
# Step 4: Integrity checks
# ---------------------------------------------------------------------------
log_info "Step 4/5: Running integrity checks..."

# Helper to run SQL in the temp container and capture output
run_sql() {
  docker exec "${TEMP_CONTAINER_NAME}" psql \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -t -A \
    -c "$1" 2>/dev/null
}

# 4a. Check that the app schema exists and has tables
TABLE_COUNT=$(run_sql "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'app' AND table_type = 'BASE TABLE';")
TABLE_COUNT=$(echo "$TABLE_COUNT" | tr -d '[:space:]')

if [ -n "$TABLE_COUNT" ] && [ "$TABLE_COUNT" -gt 0 ]; then
  record_check "App schema has tables" "PASS" "${TABLE_COUNT} tables found"
else
  record_check "App schema has tables" "FAIL" "No tables found in app schema"
fi

# 4b. Verify critical core tables exist
CRITICAL_TABLES=(
  "tenants"
  "users"
  "employees"
  "roles"
  "permissions"
  "role_permissions"
  "role_assignments"
  "audit_log"
  "domain_outbox"
  "idempotency_keys"
  "org_units"
  "positions"
)

MISSING_TABLES=()
for table in "${CRITICAL_TABLES[@]}"; do
  EXISTS=$(run_sql "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'app' AND table_name = '${table}');")
  EXISTS=$(echo "$EXISTS" | tr -d '[:space:]')
  if [ "$EXISTS" != "t" ]; then
    MISSING_TABLES+=("$table")
  fi
done

if [ ${#MISSING_TABLES[@]} -eq 0 ]; then
  record_check "Critical tables present (${#CRITICAL_TABLES[@]}/${#CRITICAL_TABLES[@]})" "PASS"
else
  record_check "Critical tables present" "FAIL" "Missing: ${MISSING_TABLES[*]}"
fi

# 4c. Verify RLS is enabled on tenant-owned tables
RLS_ENABLED_COUNT=$(run_sql "
  SELECT count(*)
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')
  WHERE t.schemaname = 'app'
    AND c.relrowsecurity = true;
")
RLS_ENABLED_COUNT=$(echo "$RLS_ENABLED_COUNT" | tr -d '[:space:]')

# Count tables that have a tenant_id column (should have RLS)
TENANT_TABLES_COUNT=$(run_sql "
  SELECT count(DISTINCT table_name)
  FROM information_schema.columns
  WHERE table_schema = 'app'
    AND column_name = 'tenant_id';
")
TENANT_TABLES_COUNT=$(echo "$TENANT_TABLES_COUNT" | tr -d '[:space:]')

if [ -n "$RLS_ENABLED_COUNT" ] && [ "$RLS_ENABLED_COUNT" -gt 0 ]; then
  if [ -n "$TENANT_TABLES_COUNT" ] && [ "$TENANT_TABLES_COUNT" -gt 0 ]; then
    if [ "$RLS_ENABLED_COUNT" -ge "$TENANT_TABLES_COUNT" ]; then
      record_check "RLS enabled on tenant tables" "PASS" "${RLS_ENABLED_COUNT} RLS-enabled tables, ${TENANT_TABLES_COUNT} tables with tenant_id"
    else
      DIFF=$((TENANT_TABLES_COUNT - RLS_ENABLED_COUNT))
      record_check "RLS enabled on tenant tables" "WARN" "${RLS_ENABLED_COUNT}/${TENANT_TABLES_COUNT} tables have RLS (${DIFF} missing)"
    fi
  else
    record_check "RLS enabled on tenant tables" "WARN" "${RLS_ENABLED_COUNT} tables with RLS, but no tenant_id columns found"
  fi
else
  record_check "RLS enabled on tenant tables" "FAIL" "No tables have RLS enabled"
fi

# 4d. Verify RLS policies exist
POLICY_COUNT=$(run_sql "SELECT count(*) FROM pg_policies WHERE schemaname = 'app';")
POLICY_COUNT=$(echo "$POLICY_COUNT" | tr -d '[:space:]')

if [ -n "$POLICY_COUNT" ] && [ "$POLICY_COUNT" -gt 0 ]; then
  record_check "RLS policies present" "PASS" "${POLICY_COUNT} policies found"
else
  record_check "RLS policies present" "FAIL" "No RLS policies found"
fi

# 4e. Verify indexes exist
INDEX_COUNT=$(run_sql "
  SELECT count(*)
  FROM pg_indexes
  WHERE schemaname = 'app';
")
INDEX_COUNT=$(echo "$INDEX_COUNT" | tr -d '[:space:]')

if [ -n "$INDEX_COUNT" ] && [ "$INDEX_COUNT" -gt 0 ]; then
  record_check "Database indexes present" "PASS" "${INDEX_COUNT} indexes found"
else
  record_check "Database indexes present" "FAIL" "No indexes found"
fi

# 4f. Verify triggers exist (updated_at, audit, etc.)
TRIGGER_COUNT=$(run_sql "
  SELECT count(*)
  FROM information_schema.triggers
  WHERE trigger_schema = 'app';
")
TRIGGER_COUNT=$(echo "$TRIGGER_COUNT" | tr -d '[:space:]')

if [ -n "$TRIGGER_COUNT" ] && [ "$TRIGGER_COUNT" -gt 0 ]; then
  record_check "Database triggers present" "PASS" "${TRIGGER_COUNT} triggers found"
else
  record_check "Database triggers present" "WARN" "No triggers found"
fi

# 4g. Verify functions exist
FUNCTION_COUNT=$(run_sql "
  SELECT count(*)
  FROM information_schema.routines
  WHERE routine_schema = 'app';
")
FUNCTION_COUNT=$(echo "$FUNCTION_COUNT" | tr -d '[:space:]')

if [ -n "$FUNCTION_COUNT" ] && [ "$FUNCTION_COUNT" -gt 0 ]; then
  record_check "Database functions present" "PASS" "${FUNCTION_COUNT} functions found"
else
  record_check "Database functions present" "WARN" "No functions found"
fi

# 4h. Verify enum types exist
ENUM_COUNT=$(run_sql "
  SELECT count(*)
  FROM pg_type t
  JOIN pg_namespace n ON t.typnamespace = n.oid
  WHERE n.nspname = 'app'
    AND t.typtype = 'e';
")
ENUM_COUNT=$(echo "$ENUM_COUNT" | tr -d '[:space:]')

if [ -n "$ENUM_COUNT" ] && [ "$ENUM_COUNT" -gt 0 ]; then
  record_check "Enum types present" "PASS" "${ENUM_COUNT} enums found"
else
  record_check "Enum types present" "WARN" "No enum types found"
fi

# 4i. Verify foreign key constraints are intact
FK_COUNT=$(run_sql "
  SELECT count(*)
  FROM information_schema.table_constraints
  WHERE constraint_schema = 'app'
    AND constraint_type = 'FOREIGN KEY';
")
FK_COUNT=$(echo "$FK_COUNT" | tr -d '[:space:]')

if [ -n "$FK_COUNT" ] && [ "$FK_COUNT" -gt 0 ]; then
  record_check "Foreign key constraints" "PASS" "${FK_COUNT} foreign keys found"
else
  record_check "Foreign key constraints" "WARN" "No foreign key constraints found"
fi

# 4j. Print table row counts for informational purposes
log_info "  Table row counts (informational):"
TABLE_COUNTS=$(run_sql "
  SELECT t.table_name,
         (xpath('/row/count/text()',
           query_to_xml('SELECT count(*) FROM app.' || quote_ident(t.table_name), false, false, ''))
         )[1]::text AS row_count
  FROM information_schema.tables t
  WHERE t.table_schema = 'app'
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name;
")

if [ -n "$TABLE_COUNTS" ]; then
  echo "$TABLE_COUNTS" | while IFS='|' read -r tname tcount; do
    tname=$(echo "$tname" | xargs)
    tcount=$(echo "$tcount" | xargs)
    if [ -n "$tname" ]; then
      printf "    %-40s %s rows\n" "$tname" "${tcount:-0}"
    fi
  done
fi

# 4k. Verify that a basic query can run with RLS context
log_info "  Testing RLS context functions..."
RLS_TEST=$(run_sql "
  SELECT app.enable_system_context();
  SELECT count(*) FROM app.tenants;
" 2>/dev/null || echo "FAILED")

# The output will include empty line from enable_system_context, then the count
TENANT_COUNT=$(echo "$RLS_TEST" | tail -1 | tr -d '[:space:]')

if [ "$TENANT_COUNT" != "FAILED" ] && [ -n "$TENANT_COUNT" ]; then
  record_check "RLS context functions operational" "PASS" "${TENANT_COUNT} tenants in backup"
else
  record_check "RLS context functions operational" "FAIL" "Could not execute RLS context functions"
fi

# ---------------------------------------------------------------------------
# Step 5: Summary report
# ---------------------------------------------------------------------------
log_info "Step 5/5: Generating report..."

echo ""
echo "================================================================="
echo "  Backup Verification Report"
echo "================================================================="
echo "  File:     $BACKUP_BASENAME"
echo "  Size:     $BACKUP_SIZE"
echo "  SHA256:   $COMPUTED_SHA256"
echo "  Restored: ${RESTORE_DURATION}s"
echo ""
echo "  Schema:   ${TABLE_COUNT:-0} tables, ${INDEX_COUNT:-0} indexes, ${TRIGGER_COUNT:-0} triggers"
echo "            ${FUNCTION_COUNT:-0} functions, ${ENUM_COUNT:-0} enums, ${FK_COUNT:-0} foreign keys"
echo "            ${RLS_ENABLED_COUNT:-0} RLS-enabled tables, ${POLICY_COUNT:-0} RLS policies"
echo ""
echo "  Checks:"
for result in "${RESULTS[@]}"; do
  echo "$result"
done
echo ""

if [ "$FAILED_CHECKS" -gt 0 ]; then
  echo "  RESULT: FAILED (${PASSED_CHECKS}/${TOTAL_CHECKS} passed, ${FAILED_CHECKS} failed, ${WARNINGS} warnings)"
  echo "================================================================="
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  echo "  RESULT: PASSED WITH WARNINGS (${PASSED_CHECKS}/${TOTAL_CHECKS} passed, ${WARNINGS} warnings)"
  echo "================================================================="
  exit 0
else
  echo "  RESULT: PASSED (${TOTAL_CHECKS}/${TOTAL_CHECKS} checks passed)"
  echo "================================================================="
  exit 0
fi
