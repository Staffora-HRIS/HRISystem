#!/bin/bash
# =============================================================================
# Secret Rotation Helper Script
# =============================================================================
#
# Generates new random secrets for all Staffora platform credentials and
# outputs the required environment variable updates.
#
# Usage:
#   ./rotate-secrets.sh                 # Print new secrets to stdout (dry run)
#   ./rotate-secrets.sh --apply         # Backup docker/.env and write new values
#   ./rotate-secrets.sh --secret <name> # Rotate a single secret
#
# Supported secret names for --secret:
#   better-auth, session, csrf, postgres, postgres-app, redis, s3, smtp
#
# This script does NOT restart containers. After applying changes, you must
# restart the affected services manually:
#   docker compose -f docker/docker-compose.yml restart api worker
#
# See: Docs/operations/secret-rotation.md for full rotation procedures.
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$DOCKER_DIR/.env"

# Colors for output (disabled if not a terminal)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  BOLD='\033[1m'
  NC='\033[0m' # No Color
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  BOLD=''
  NC=''
fi

# =============================================================================
# Helper Functions
# =============================================================================

# Generate a cryptographically secure random string.
# Uses openssl if available, falls back to /dev/urandom.
generate_secret() {
  local length="${1:-32}"
  if command -v openssl &>/dev/null; then
    openssl rand -base64 "$length" | tr -d '\n'
  elif [ -r /dev/urandom ]; then
    head -c "$length" /dev/urandom | base64 | tr -d '\n/+=' | head -c "$length"
  else
    echo "ERROR: Cannot generate random secret -- neither openssl nor /dev/urandom available" >&2
    exit 1
  fi
}

# Generate a random password suitable for database/redis (no special shell chars).
# Uses alphanumeric + limited special characters to avoid URL-encoding issues.
generate_password() {
  local length="${1:-32}"
  if command -v openssl &>/dev/null; then
    openssl rand -base64 "$length" | tr -d '\n/+=' | head -c "$length"
  elif [ -r /dev/urandom ]; then
    head -c "$length" /dev/urandom | base64 | tr -d '\n/+=' | head -c "$length"
  else
    echo "ERROR: Cannot generate random password" >&2
    exit 1
  fi
}

print_header() {
  echo ""
  echo -e "${BOLD}=============================================${NC}"
  echo -e "${BOLD} Staffora Secret Rotation Helper${NC}"
  echo -e "${BOLD}=============================================${NC}"
  echo ""
}

print_section() {
  echo ""
  echo -e "${BLUE}--- $1 ---${NC}"
}

print_warning() {
  echo -e "${YELLOW}WARNING: $1${NC}"
}

print_success() {
  echo -e "${GREEN}$1${NC}"
}

print_error() {
  echo -e "${RED}ERROR: $1${NC}" >&2
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Generate new random secrets for the Staffora platform.

Options:
  --apply              Write new secrets to docker/.env (creates backup first)
  --secret <name>      Rotate only a specific secret
  --env-file <path>    Path to .env file (default: docker/.env)
  --help               Show this help message

Secret names for --secret:
  better-auth          BETTER_AUTH_SECRET
  session              SESSION_SECRET
  csrf                 CSRF_SECRET
  postgres             POSTGRES_PASSWORD (hris superuser)
  postgres-app         POSTGRES_APP_PASSWORD (hris_app runtime user)
  redis                REDIS_PASSWORD
  s3                   S3_ACCESS_KEY and S3_SECRET_KEY
  smtp                 SMTP_USER and SMTP_PASSWORD

Examples:
  $(basename "$0")                      # Print all new secrets (dry run)
  $(basename "$0") --apply              # Generate and write to .env
  $(basename "$0") --secret redis       # Rotate only Redis password
  $(basename "$0") --secret postgres --apply  # Rotate and write Postgres password
EOF
}

# =============================================================================
# Secret Generation
# =============================================================================

generate_all_secrets() {
  local target="${1:-all}"

  declare -A secrets

  if [[ "$target" == "all" || "$target" == "better-auth" ]]; then
    secrets[BETTER_AUTH_SECRET]="$(generate_secret 32)"
  fi

  if [[ "$target" == "all" || "$target" == "session" ]]; then
    secrets[SESSION_SECRET]="$(generate_secret 32)"
  fi

  if [[ "$target" == "all" || "$target" == "csrf" ]]; then
    secrets[CSRF_SECRET]="$(generate_secret 32)"
  fi

  if [[ "$target" == "all" || "$target" == "postgres" ]]; then
    secrets[POSTGRES_PASSWORD]="$(generate_password 24)"
  fi

  if [[ "$target" == "all" || "$target" == "postgres-app" ]]; then
    secrets[POSTGRES_APP_PASSWORD]="$(generate_password 24)"
  fi

  if [[ "$target" == "all" || "$target" == "redis" ]]; then
    secrets[REDIS_PASSWORD]="$(generate_password 24)"
  fi

  if [[ "$target" == "all" || "$target" == "s3" ]]; then
    secrets[S3_ACCESS_KEY]="<generate-in-aws-console>"
    secrets[S3_SECRET_KEY]="<generate-in-aws-console>"
    secrets[AWS_ACCESS_KEY_ID]="<generate-in-aws-console>"
    secrets[AWS_SECRET_ACCESS_KEY]="<generate-in-aws-console>"
  fi

  if [[ "$target" == "all" || "$target" == "smtp" ]]; then
    secrets[SMTP_USER]="<generate-in-email-provider>"
    secrets[SMTP_PASSWORD]="<generate-in-email-provider>"
  fi

  # Print generated secrets
  print_header

  if [[ "$target" == "all" || "$target" == "better-auth" || "$target" == "session" || "$target" == "csrf" ]]; then
    print_section "Authentication Secrets"
    if [[ -v secrets[BETTER_AUTH_SECRET] ]]; then
      echo "BETTER_AUTH_SECRET=${secrets[BETTER_AUTH_SECRET]}"
    fi
    if [[ -v secrets[SESSION_SECRET] ]]; then
      echo "SESSION_SECRET=${secrets[SESSION_SECRET]}"
    fi
    if [[ -v secrets[CSRF_SECRET] ]]; then
      echo "CSRF_SECRET=${secrets[CSRF_SECRET]}"
    fi
    echo ""
    print_warning "Rotating BETTER_AUTH_SECRET invalidates ALL active sessions."
    print_warning "Rotating CSRF_SECRET invalidates in-flight CSRF tokens (8h max age)."
  fi

  if [[ "$target" == "all" || "$target" == "postgres" || "$target" == "postgres-app" ]]; then
    print_section "PostgreSQL Passwords"
    if [[ -v secrets[POSTGRES_PASSWORD] ]]; then
      echo "POSTGRES_PASSWORD=${secrets[POSTGRES_PASSWORD]}"
      echo "DATABASE_URL=postgres://hris:${secrets[POSTGRES_PASSWORD]}@localhost:5432/hris"
    fi
    if [[ -v secrets[POSTGRES_APP_PASSWORD] ]]; then
      echo "POSTGRES_APP_PASSWORD=${secrets[POSTGRES_APP_PASSWORD]}"
      echo "DATABASE_APP_URL=postgres://hris_app:${secrets[POSTGRES_APP_PASSWORD]}@localhost:5432/hris"
    fi
    echo ""
    print_warning "You must also run ALTER USER in PostgreSQL BEFORE restarting containers."
    echo "  docker exec -i staffora-postgres psql -U postgres -c \\"
    if [[ -v secrets[POSTGRES_PASSWORD] ]]; then
      echo "    \"ALTER USER hris WITH PASSWORD '${secrets[POSTGRES_PASSWORD]}';\""
    fi
    if [[ -v secrets[POSTGRES_APP_PASSWORD] ]]; then
      echo "  docker exec -i staffora-postgres psql -U hris -c \\"
      echo "    \"ALTER USER hris_app WITH PASSWORD '${secrets[POSTGRES_APP_PASSWORD]}';\""
    fi
  fi

  if [[ "$target" == "all" || "$target" == "redis" ]]; then
    print_section "Redis Password"
    if [[ -v secrets[REDIS_PASSWORD] ]]; then
      echo "REDIS_PASSWORD=${secrets[REDIS_PASSWORD]}"
      echo "REDIS_URL=redis://:${secrets[REDIS_PASSWORD]}@localhost:6379"
    fi
    echo ""
    print_warning "You must update Redis CONFIG before restarting containers."
    echo "  docker exec staffora-redis redis-cli \\"
    echo "    -a \"\${OLD_REDIS_PASSWORD}\" --no-auth-warning \\"
    echo "    CONFIG SET requirepass \"${secrets[REDIS_PASSWORD]:-<new-password>}\""
  fi

  if [[ "$target" == "all" || "$target" == "s3" ]]; then
    print_section "S3 Credentials"
    echo "S3_ACCESS_KEY=<generate-in-aws-console>"
    echo "S3_SECRET_KEY=<generate-in-aws-console>"
    echo "AWS_ACCESS_KEY_ID=<generate-in-aws-console>"
    echo "AWS_SECRET_ACCESS_KEY=<generate-in-aws-console>"
    echo ""
    print_warning "S3 credentials must be generated in AWS IAM Console."
    echo "  aws iam create-access-key --user-name staffora-app"
  fi

  if [[ "$target" == "all" || "$target" == "smtp" ]]; then
    print_section "SMTP Credentials"
    echo "SMTP_USER=<generate-in-email-provider>"
    echo "SMTP_PASSWORD=<generate-in-email-provider>"
    echo ""
    print_warning "SMTP credentials must be generated in your email provider dashboard."
  fi

  # Print restart instructions
  print_section "Next Steps"
  echo ""
  echo "1. Apply the database password changes (if rotating PostgreSQL):"
  echo "   Run the ALTER USER commands shown above BEFORE restarting containers."
  echo ""
  echo "2. Apply the Redis password change (if rotating Redis):"
  echo "   Run the CONFIG SET command shown above BEFORE restarting containers."
  echo ""
  echo "3. Update docker/.env with the new values (or use --apply flag)."
  echo ""
  echo "4. Restart affected containers:"
  echo "   docker compose -f docker/docker-compose.yml restart api worker"
  echo ""
  echo "5. Verify health:"
  echo "   curl -s http://localhost:3000/health | jq ."
  echo ""
  echo "6. See Docs/operations/secret-rotation.md for detailed verification steps."
  echo ""

  # Return secrets via nameref for --apply mode
  if [[ "${2:-}" == "return" ]]; then
    for key in "${!secrets[@]}"; do
      echo "___SECRET___${key}=${secrets[$key]}"
    done
  fi
}

# =============================================================================
# Apply Mode: Write to .env
# =============================================================================

apply_secrets() {
  local target="${1:-all}"

  if [ ! -f "$ENV_FILE" ]; then
    print_error ".env file not found at $ENV_FILE"
    echo "Create it first: cp docker/.env.example docker/.env"
    exit 1
  fi

  # Create backup
  local backup_file="${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
  cp "$ENV_FILE" "$backup_file"
  print_success "Backup created: $backup_file"

  # Capture generated secrets
  local output
  output=$(generate_all_secrets "$target" "return")

  # Print the user-facing output (lines without ___SECRET___ prefix)
  echo "$output" | grep -v "^___SECRET___"

  # Extract secret values and update .env
  local updated=0
  while IFS='=' read -r key value; do
    key="${key#___SECRET___}"

    # Skip placeholder values (S3, SMTP)
    if [[ "$value" == "<generate-in-"* ]]; then
      continue
    fi

    # Update or append the key in .env
    if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
      # Use a delimiter that won't conflict with base64 characters
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
      updated=$((updated + 1))
    elif grep -q "^# *${key}=" "$ENV_FILE" 2>/dev/null; then
      # Uncomment and set the value
      sed -i "s|^# *${key}=.*|${key}=${value}|" "$ENV_FILE"
      updated=$((updated + 1))
    else
      # Append to file
      echo "${key}=${value}" >> "$ENV_FILE"
      updated=$((updated + 1))
    fi
  done < <(echo "$output" | grep "^___SECRET___" | sed 's/^___SECRET___//')

  # Also update derived URLs in .env
  if echo "$output" | grep -q "___SECRET___POSTGRES_PASSWORD="; then
    local pg_pass
    pg_pass=$(echo "$output" | grep "___SECRET___POSTGRES_PASSWORD=" | sed 's/___SECRET___POSTGRES_PASSWORD=//')
    if grep -q "^DATABASE_URL=" "$ENV_FILE"; then
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgres://hris:${pg_pass}@localhost:5432/hris|" "$ENV_FILE"
    fi
  fi

  if echo "$output" | grep -q "___SECRET___POSTGRES_APP_PASSWORD="; then
    local pg_app_pass
    pg_app_pass=$(echo "$output" | grep "___SECRET___POSTGRES_APP_PASSWORD=" | sed 's/___SECRET___POSTGRES_APP_PASSWORD=//')
    if grep -q "^DATABASE_APP_URL=" "$ENV_FILE"; then
      sed -i "s|^DATABASE_APP_URL=.*|DATABASE_APP_URL=postgres://hris_app:${pg_app_pass}@localhost:5432/hris|" "$ENV_FILE"
    fi
  fi

  if echo "$output" | grep -q "___SECRET___REDIS_PASSWORD="; then
    local redis_pass
    redis_pass=$(echo "$output" | grep "___SECRET___REDIS_PASSWORD=" | sed 's/___SECRET___REDIS_PASSWORD=//')
    if grep -q "^REDIS_URL=" "$ENV_FILE"; then
      sed -i "s|^REDIS_URL=.*|REDIS_URL=redis://:${redis_pass}@localhost:6379|" "$ENV_FILE"
    fi
  fi

  echo ""
  print_success "Updated $updated secret(s) in $ENV_FILE"
  print_warning "Remember to run ALTER USER / CONFIG SET commands before restarting containers!"
  echo ""
}

# =============================================================================
# Main
# =============================================================================

main() {
  local apply_mode=false
  local target="all"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --apply)
        apply_mode=true
        shift
        ;;
      --secret)
        if [[ -z "${2:-}" ]]; then
          print_error "--secret requires a secret name"
          usage
          exit 1
        fi
        target="$2"
        # Validate secret name
        case "$target" in
          better-auth|session|csrf|postgres|postgres-app|redis|s3|smtp|all)
            ;;
          *)
            print_error "Unknown secret name: $target"
            echo "Valid names: better-auth, session, csrf, postgres, postgres-app, redis, s3, smtp"
            exit 1
            ;;
        esac
        shift 2
        ;;
      --env-file)
        if [[ -z "${2:-}" ]]; then
          print_error "--env-file requires a path"
          exit 1
        fi
        ENV_FILE="$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        print_error "Unknown option: $1"
        usage
        exit 1
        ;;
    esac
  done

  if $apply_mode; then
    apply_secrets "$target"
  else
    generate_all_secrets "$target"
  fi
}

main "$@"
