-- Migration: 0001_extensions
-- Created: 2026-01-07
-- Description: Enable required PostgreSQL extensions for UUID generation and cryptographic functions

-- =============================================================================
-- UP Migration
-- =============================================================================

-- UUID generation support (provides gen_random_uuid() and uuid_generate_v4())
-- gen_random_uuid() is preferred as it uses the PostgreSQL random number generator
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Cryptographic functions for password hashing, encryption, and secure random generation
-- Provides functions like crypt(), gen_salt(), digest(), hmac(), etc.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON EXTENSION "uuid-ossp" IS 'UUID generation functions for primary keys';
COMMENT ON EXTENSION "pgcrypto" IS 'Cryptographic functions for password hashing and encryption';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================
-- Note: Dropping extensions may fail if objects depend on them
-- Execute manually with CASCADE if needed

-- DROP EXTENSION IF EXISTS "pgcrypto";
-- DROP EXTENSION IF EXISTS "uuid-ossp";
