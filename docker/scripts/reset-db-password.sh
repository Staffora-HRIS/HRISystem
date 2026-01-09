#!/bin/bash
# =============================================================================
# PostgreSQL Password Reset Script
# =============================================================================
#
# This script resets the PostgreSQL password to match the application defaults.
# Use this when the database volume was created with a different password than
# what the application expects.
#
# FIX: Created to address authentication failures caused by password mismatch
# between the PostgreSQL volume and application configuration.
#
# Usage:
#   ./reset-db-password.sh
#
# Prerequisites:
#   - Docker must be running
#   - The postgres container must be running
# =============================================================================

set -e

# Configuration - must match docker-compose.yml and application defaults
DB_USER="${POSTGRES_USER:-hris}"
DB_PASSWORD="${POSTGRES_PASSWORD:-hris_dev_password}"
CONTAINER_NAME="hris-postgres"

echo "============================================="
echo "PostgreSQL Password Reset Script"
echo "============================================="
echo ""
echo "This will reset the password for user '$DB_USER' to '$DB_PASSWORD'"
echo ""

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "ERROR: Container '$CONTAINER_NAME' is not running."
    echo ""
    echo "Please start the containers first with:"
    echo "  cd docker && docker-compose up -d postgres"
    exit 1
fi

echo "Resetting password..."

# Execute password reset in the container
docker exec -i "$CONTAINER_NAME" psql -U postgres -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

if [ $? -eq 0 ]; then
    echo ""
    echo "============================================="
    echo "SUCCESS: Password reset complete!"
    echo "============================================="
    echo ""
    echo "The password for user '$DB_USER' has been reset to '$DB_PASSWORD'"
    echo ""
    echo "Please restart the application containers:"
    echo "  docker-compose restart api worker"
    echo ""
else
    echo ""
    echo "ERROR: Failed to reset password."
    echo "Please check that PostgreSQL is running and accessible."
    exit 1
fi
