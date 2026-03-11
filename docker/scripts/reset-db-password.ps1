# =============================================================================
# PostgreSQL Password Reset Script (PowerShell)
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
#   .\reset-db-password.ps1
#
# Prerequisites:
#   - Docker must be running
#   - The postgres container must be running
# =============================================================================

param(
    [string]$DbUser = "hris",
    [string]$DbPassword = "hris_dev_password",
    [string]$ContainerName = "staffora-postgres"
)

Write-Host "============================================="
Write-Host "PostgreSQL Password Reset Script"
Write-Host "============================================="
Write-Host ""
Write-Host "This will reset the password for user '$DbUser' to '$DbPassword'"
Write-Host ""

# Check if Docker is available
try {
    docker --version | Out-Null
} catch {
    Write-Host "ERROR: Docker is not available or not in PATH." -ForegroundColor Red
    exit 1
}

# Check if container is running
$runningContainers = docker ps --format '{{.Names}}'
if ($runningContainers -notcontains $ContainerName) {
    Write-Host "ERROR: Container '$ContainerName' is not running." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start the containers first with:"
    Write-Host "  cd docker; docker-compose up -d postgres"
    exit 1
}

Write-Host "Resetting password..."

# Execute password reset in the container
try {
    $sqlCommand = "ALTER USER $DbUser WITH PASSWORD '$DbPassword';"
    docker exec -i $ContainerName psql -U postgres -c $sqlCommand
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host "SUCCESS: Password reset complete!" -ForegroundColor Green
        Write-Host "=============================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "The password for user '$DbUser' has been reset to '$DbPassword'"
        Write-Host ""
        Write-Host "Please restart the application containers:"
        Write-Host "  docker-compose restart api worker"
        Write-Host ""
    } else {
        throw "psql command failed"
    }
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to reset password." -ForegroundColor Red
    Write-Host "Please check that PostgreSQL is running and accessible."
    Write-Host "Error: $_"
    exit 1
}
