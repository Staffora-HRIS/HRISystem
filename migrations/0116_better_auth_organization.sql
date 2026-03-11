-- Migration: 0116_better_auth_organization
-- Created: 2026-03-10
-- Description: Add Better Auth organization plugin tables (organization, member, invitation)
--              and the activeOrganizationId column on the session table.
--
--              These tables are managed internally by Better Auth's organization plugin.
--              They use camelCase column names (quoted identifiers) to match Better Auth's
--              expected schema, consistent with the core Better Auth tables in migration 0089.
--
--              RLS is NOT applied to these tables because Better Auth manages them directly
--              through its own adapter layer, which does not set the app.current_tenant
--              session variable. This is consistent with the other Better Auth tables
--              (user, session, account, verification, twoFactor) which also lack RLS.
--
-- Note: The team, teamMember, and organizationRole tables are NOT created here because
--       the organization plugin is initialized without teams or dynamicAccessControl options.
--       If those features are enabled later, a new migration should add those tables.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Organization table
--    Represents an organization entity within Better Auth.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app."organization" (
    id text PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL,
    logo text,
    metadata text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),

    -- Slug must be unique across all organizations
    CONSTRAINT organization_slug_unique UNIQUE (slug)
);

-- ---------------------------------------------------------------------------
-- 2. Member table
--    Links users to organizations with a role assignment.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app."member" (
    id text PRIMARY KEY,
    "organizationId" text NOT NULL REFERENCES app."organization"(id) ON DELETE CASCADE,
    "userId" text NOT NULL REFERENCES app."user"(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member',
    "createdAt" timestamptz NOT NULL DEFAULT now(),

    -- A user can only be a member of an organization once
    CONSTRAINT member_org_user_unique UNIQUE ("organizationId", "userId")
);

-- ---------------------------------------------------------------------------
-- 3. Invitation table
--    Tracks invitations to join an organization.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app."invitation" (
    id text PRIMARY KEY,
    "organizationId" text NOT NULL REFERENCES app."organization"(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text,
    status text NOT NULL DEFAULT 'pending',
    "expiresAt" timestamptz NOT NULL,
    "inviterId" text NOT NULL REFERENCES app."user"(id) ON DELETE CASCADE,
    "createdAt" timestamptz NOT NULL DEFAULT now(),

    -- Validate status values at the database level
    CONSTRAINT invitation_status_check CHECK (
        status IN ('pending', 'accepted', 'rejected', 'canceled')
    )
);

-- ---------------------------------------------------------------------------
-- 4. Add activeOrganizationId column to session table
--    The organization plugin stores the user's currently active organization
--    on the session so it persists across requests.
-- ---------------------------------------------------------------------------
ALTER TABLE app."session"
ADD COLUMN IF NOT EXISTS "activeOrganizationId" text;

-- =============================================================================
-- Indexes
-- =============================================================================

-- Organization indexes
CREATE INDEX IF NOT EXISTS idx_ba_organization_slug
    ON app."organization"(slug);

CREATE INDEX IF NOT EXISTS idx_ba_organization_name
    ON app."organization"(name);

-- Member indexes
CREATE INDEX IF NOT EXISTS idx_ba_member_org_id
    ON app."member"("organizationId");

CREATE INDEX IF NOT EXISTS idx_ba_member_user_id
    ON app."member"("userId");

CREATE INDEX IF NOT EXISTS idx_ba_member_role
    ON app."member"(role);

-- Invitation indexes
CREATE INDEX IF NOT EXISTS idx_ba_invitation_org_id
    ON app."invitation"("organizationId");

CREATE INDEX IF NOT EXISTS idx_ba_invitation_email
    ON app."invitation"(email);

CREATE INDEX IF NOT EXISTS idx_ba_invitation_inviter_id
    ON app."invitation"("inviterId");

CREATE INDEX IF NOT EXISTS idx_ba_invitation_status
    ON app."invitation"(status);

CREATE INDEX IF NOT EXISTS idx_ba_invitation_expires
    ON app."invitation"("expiresAt");

-- Session index for activeOrganizationId lookups
CREATE INDEX IF NOT EXISTS idx_ba_session_active_org
    ON app."session"("activeOrganizationId")
    WHERE "activeOrganizationId" IS NOT NULL;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app."organization" IS 'Better Auth organization plugin - organizations';
COMMENT ON TABLE app."member" IS 'Better Auth organization plugin - organization membership';
COMMENT ON TABLE app."invitation" IS 'Better Auth organization plugin - organization invitations';

COMMENT ON COLUMN app."organization".id IS 'Organization identifier (text, generated by Better Auth)';
COMMENT ON COLUMN app."organization".name IS 'Display name of the organization';
COMMENT ON COLUMN app."organization".slug IS 'URL-friendly unique identifier';
COMMENT ON COLUMN app."organization".logo IS 'URL to the organization logo image';
COMMENT ON COLUMN app."organization".metadata IS 'JSON string of arbitrary metadata';
COMMENT ON COLUMN app."organization"."createdAt" IS 'Timestamp when the organization was created';

COMMENT ON COLUMN app."member"."organizationId" IS 'Reference to the organization';
COMMENT ON COLUMN app."member"."userId" IS 'Reference to the Better Auth user';
COMMENT ON COLUMN app."member".role IS 'Member role within the organization (owner, admin, member)';
COMMENT ON COLUMN app."member"."createdAt" IS 'Timestamp when the membership was created';

COMMENT ON COLUMN app."invitation"."organizationId" IS 'Reference to the organization being invited to';
COMMENT ON COLUMN app."invitation".email IS 'Email address of the invitee';
COMMENT ON COLUMN app."invitation".role IS 'Role to assign when invitation is accepted';
COMMENT ON COLUMN app."invitation".status IS 'Invitation status: pending, accepted, rejected, canceled';
COMMENT ON COLUMN app."invitation"."expiresAt" IS 'When the invitation expires';
COMMENT ON COLUMN app."invitation"."inviterId" IS 'User who sent the invitation';
COMMENT ON COLUMN app."invitation"."createdAt" IS 'Timestamp when the invitation was created';

COMMENT ON COLUMN app."session"."activeOrganizationId" IS 'Currently active organization for this session (Better Auth organization plugin)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_ba_session_active_org;
-- DROP INDEX IF EXISTS app.idx_ba_invitation_expires;
-- DROP INDEX IF EXISTS app.idx_ba_invitation_status;
-- DROP INDEX IF EXISTS app.idx_ba_invitation_inviter_id;
-- DROP INDEX IF EXISTS app.idx_ba_invitation_email;
-- DROP INDEX IF EXISTS app.idx_ba_invitation_org_id;
-- DROP INDEX IF EXISTS app.idx_ba_member_role;
-- DROP INDEX IF EXISTS app.idx_ba_member_user_id;
-- DROP INDEX IF EXISTS app.idx_ba_member_org_id;
-- DROP INDEX IF EXISTS app.idx_ba_organization_name;
-- DROP INDEX IF EXISTS app.idx_ba_organization_slug;
-- ALTER TABLE app."session" DROP COLUMN IF EXISTS "activeOrganizationId";
-- DROP TABLE IF EXISTS app."invitation";
-- DROP TABLE IF EXISTS app."member";
-- DROP TABLE IF EXISTS app."organization";
