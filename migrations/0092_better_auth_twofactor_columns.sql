-- Migration: 0092_better_auth_twofactor_columns.sql
-- Description: Add missing columns for Better Auth twoFactor plugin
-- The twoFactor plugin expects these columns on the user table

-- Add twoFactor columns to app."user" table
ALTER TABLE app."user"
ADD COLUMN IF NOT EXISTS "twoFactorEnabled" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "twoFactorSecret" text,
ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" text;

-- Add index for twoFactorEnabled lookups
CREATE INDEX IF NOT EXISTS idx_user_two_factor_enabled ON app."user"("twoFactorEnabled");

COMMENT ON COLUMN app."user"."twoFactorEnabled" IS 'Whether two-factor authentication is enabled for the user';
COMMENT ON COLUMN app."user"."twoFactorSecret" IS 'TOTP secret for two-factor authentication';
COMMENT ON COLUMN app."user"."twoFactorBackupCodes" IS 'Encrypted backup codes for account recovery';
