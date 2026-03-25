#!/usr/bin/env bash
# =============================================================================
# Staffora Platform — Let's Encrypt Certificate Initialisation
# =============================================================================
# First-time certificate provisioning for staffora.co.uk and api.staffora.co.uk.
#
# This script:
#   1. Validates prerequisites (Docker, docker compose, required env vars)
#   2. Creates required directories and sets permissions
#   3. Downloads recommended TLS parameters from Mozilla
#   4. Starts nginx with a temporary self-signed certificate
#   5. Requests real certificates from Let's Encrypt via HTTP-01 challenge
#   6. Reloads nginx with the new certificates
#
# Usage:
#   ./scripts/init-letsencrypt.sh                  # Production certificates
#   ./scripts/init-letsencrypt.sh --staging        # Staging (testing) certificates
#   ./scripts/init-letsencrypt.sh --dry-run        # Simulate without issuing
#   ./scripts/init-letsencrypt.sh --email admin@staffora.co.uk
#
# Environment variables (override defaults):
#   CERTBOT_DOMAINS  — Space-separated list of domains (default: staffora.co.uk api.staffora.co.uk)
#   CERTBOT_EMAIL    — Email for Let's Encrypt notifications (default: admin@staffora.co.uk)
#   COMPOSE_FILE     — Path to docker-compose.yml (default: docker/docker-compose.yml)
#
# Prerequisites:
#   - Docker and docker compose installed
#   - DNS A records for all domains pointing to this server
#   - Port 80 reachable from the internet (for HTTP-01 challenge)
#
# See: Docs/operations/ssl-certificates.md for full documentation.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_ROOT/docker/docker-compose.yml}"
DATA_PATH="$PROJECT_ROOT/docker/certbot/conf"
WEBROOT_PATH="$PROJECT_ROOT/docker/certbot/www"

# Default domains and email
DOMAINS="${CERTBOT_DOMAINS:-staffora.co.uk api.staffora.co.uk}"
EMAIL="${CERTBOT_EMAIL:-admin@staffora.co.uk}"
CERT_NAME="staffora.co.uk"

# Flags
STAGING=0
DRY_RUN=0

# ---------------------------------------------------------------------------
# Colour output helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --staging)
            STAGING=1
            shift
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        --email)
            EMAIL="$2"
            shift 2
            ;;
        --domains)
            DOMAINS="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --staging     Use Let's Encrypt staging server (for testing)"
            echo "  --dry-run     Simulate the process without issuing certificates"
            echo "  --email ADDR  Email for Let's Encrypt notifications"
            echo "  --domains STR Space-separated list of domains"
            echo "  --help        Show this help message"
            exit 0
            ;;
        *)
            error "Unknown option: $1. Use --help for usage information."
            ;;
    esac
done

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
info "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
    error "Docker is not installed. Install Docker first: https://docs.docker.com/get-docker/"
fi

if ! docker compose version &>/dev/null; then
    error "Docker Compose V2 is not available. Install it: https://docs.docker.com/compose/install/"
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
    error "Compose file not found: $COMPOSE_FILE"
fi

success "Prerequisites satisfied."

# ---------------------------------------------------------------------------
# Display configuration
# ---------------------------------------------------------------------------
echo ""
info "Configuration:"
info "  Domains:      $DOMAINS"
info "  Email:        $EMAIL"
info "  Data path:    $DATA_PATH"
info "  Compose file: $COMPOSE_FILE"
if [[ $STAGING -eq 1 ]]; then
    warn "  Environment:  STAGING (certificates will NOT be trusted by browsers)"
else
    info "  Environment:  PRODUCTION"
fi
if [[ $DRY_RUN -eq 1 ]]; then
    warn "  Mode:         DRY RUN (no certificates will be issued)"
fi
echo ""

# Build domain arguments for certbot (-d flag per domain)
DOMAIN_ARGS=""
for domain in $DOMAINS; do
    DOMAIN_ARGS="$DOMAIN_ARGS -d $domain"
done

# ---------------------------------------------------------------------------
# Step 1: Create directories
# ---------------------------------------------------------------------------
info "Step 1/6: Creating certificate directories..."

mkdir -p "$DATA_PATH"
mkdir -p "$WEBROOT_PATH"

success "Directories created."

# ---------------------------------------------------------------------------
# Step 2: Download recommended TLS parameters
# ---------------------------------------------------------------------------
TLS_PARAMS_FILE="$DATA_PATH/options-ssl-nginx.conf"
DH_PARAMS_FILE="$DATA_PATH/ssl-dhparams.pem"

if [[ ! -f "$TLS_PARAMS_FILE" ]]; then
    info "Step 2/6: Downloading recommended TLS parameters from certbot..."
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
        > "$TLS_PARAMS_FILE" \
        || error "Failed to download TLS parameters."
    success "TLS parameters downloaded."
else
    info "Step 2/6: TLS parameters already exist, skipping download."
fi

if [[ ! -f "$DH_PARAMS_FILE" ]]; then
    info "Generating Diffie-Hellman parameters (2048-bit)..."
    openssl dhparam -out "$DH_PARAMS_FILE" 2048 2>/dev/null \
        || error "Failed to generate DH parameters."
    success "DH parameters generated."
else
    info "DH parameters already exist, skipping generation."
fi

# ---------------------------------------------------------------------------
# Step 3: Create temporary self-signed certificate
# ---------------------------------------------------------------------------
# Nginx requires a certificate to start. We create a temporary self-signed one
# so nginx can serve the ACME challenge while certbot requests the real cert.
LIVE_PATH="$DATA_PATH/live/$CERT_NAME"

info "Step 3/6: Creating temporary self-signed certificate..."

mkdir -p "$LIVE_PATH"

if [[ ! -f "$LIVE_PATH/fullchain.pem" ]] || [[ ! -f "$LIVE_PATH/privkey.pem" ]]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout "$LIVE_PATH/privkey.pem" \
        -out "$LIVE_PATH/fullchain.pem" \
        -subj "/CN=localhost" \
        2>/dev/null \
        || error "Failed to create temporary self-signed certificate."
    success "Temporary certificate created."
else
    info "Temporary certificate already exists."
fi

# ---------------------------------------------------------------------------
# Step 4: Start nginx
# ---------------------------------------------------------------------------
info "Step 4/6: Starting nginx..."

docker compose -f "$COMPOSE_FILE" --profile production up -d nginx
sleep 3

# Verify nginx is running
if ! docker compose -f "$COMPOSE_FILE" ps nginx 2>/dev/null | grep -q "running\|Up"; then
    warn "Nginx may not be running yet. Checking logs..."
    docker compose -f "$COMPOSE_FILE" logs --tail=20 nginx
    error "Nginx failed to start. Check the logs above."
fi

success "Nginx is running."

# ---------------------------------------------------------------------------
# Step 5: Request certificates from Let's Encrypt
# ---------------------------------------------------------------------------
info "Step 5/6: Requesting certificates from Let's Encrypt..."

# Remove temporary certificate so certbot can create the real one
rm -rf "$LIVE_PATH"

# Build certbot command
CERTBOT_CMD="certonly --webroot -w /var/www/certbot"
CERTBOT_CMD="$CERTBOT_CMD --cert-name $CERT_NAME"
CERTBOT_CMD="$CERTBOT_CMD $DOMAIN_ARGS"
CERTBOT_CMD="$CERTBOT_CMD --email $EMAIL"
CERTBOT_CMD="$CERTBOT_CMD --rsa-key-size 4096"
CERTBOT_CMD="$CERTBOT_CMD --agree-tos"
CERTBOT_CMD="$CERTBOT_CMD --non-interactive"
CERTBOT_CMD="$CERTBOT_CMD --preferred-chain 'ISRG Root X1'"

if [[ $STAGING -eq 1 ]]; then
    CERTBOT_CMD="$CERTBOT_CMD --staging"
    warn "Using Let's Encrypt STAGING server."
fi

if [[ $DRY_RUN -eq 1 ]]; then
    CERTBOT_CMD="$CERTBOT_CMD --dry-run"
    warn "Running in DRY RUN mode."
fi

docker compose -f "$COMPOSE_FILE" --profile production run --rm certbot $CERTBOT_CMD

if [[ $DRY_RUN -eq 0 ]]; then
    success "Certificates obtained successfully."
else
    success "Dry run completed successfully."
fi

# ---------------------------------------------------------------------------
# Step 6: Reload nginx with real certificates
# ---------------------------------------------------------------------------
info "Step 6/6: Reloading nginx with new certificates..."

docker compose -f "$COMPOSE_FILE" --profile production exec nginx nginx -s reload

success "Nginx reloaded with Let's Encrypt certificates."

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "==========================================================================="
if [[ $DRY_RUN -eq 0 ]]; then
    success "TLS certificate provisioning complete!"
    echo ""
    info "Certificates issued for:"
    for domain in $DOMAINS; do
        echo "    - $domain"
    done
    echo ""
    info "Certificate files:"
    echo "    Full chain:  $DATA_PATH/live/$CERT_NAME/fullchain.pem"
    echo "    Private key: $DATA_PATH/live/$CERT_NAME/privkey.pem"
    echo ""
    info "Automatic renewal:"
    echo "    The certbot container checks for renewal every 12 hours."
    echo "    Nginx is reloaded automatically after successful renewal."
    echo ""
    if [[ $STAGING -eq 1 ]]; then
        warn "STAGING certificates are NOT trusted by browsers."
        warn "Once verified, re-run without --staging for production certificates:"
        echo "    ./scripts/init-letsencrypt.sh"
    fi
else
    success "Dry run completed. No certificates were issued."
    echo "    Run without --dry-run to obtain real certificates."
fi
echo "==========================================================================="
echo ""
info "Next steps:"
echo "    1. Verify: curl -vI https://staffora.co.uk"
echo "    2. Start all services: docker compose -f $COMPOSE_FILE --profile production up -d"
echo "    3. Monitor renewal: docker compose -f $COMPOSE_FILE logs -f certbot"
echo ""
