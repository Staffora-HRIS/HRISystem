/**
 * Authentication Types
 *
 * Type definitions for authentication, authorization, sessions,
 * and multi-factor authentication.
 */

import type {
  UUID,
  TimestampString,
  BaseEntity,
  TenantScopedEntity,
} from "./common";

// =============================================================================
// User Types
// =============================================================================

/** User account status */
export type UserStatus = "active" | "inactive" | "pending" | "locked" | "suspended";

/**
 * User entity representing an authenticated user account.
 * Note: Sensitive fields like password hash are excluded.
 */
export interface User extends BaseEntity {
  /** User's email address (unique) */
  email: string;
  /** User's display name */
  displayName: string;
  /** User's first name */
  firstName: string;
  /** User's last name */
  lastName: string;
  /** Current account status */
  status: UserStatus;
  /** Whether MFA is enabled for this user */
  mfaEnabled: boolean;
  /** Timestamp of last successful login */
  lastLoginAt: TimestampString | null;
  /** Number of consecutive failed login attempts */
  failedLoginAttempts: number;
  /** Timestamp when account was locked (if applicable) */
  lockedAt: TimestampString | null;
  /** Whether user must change password on next login */
  passwordChangeRequired: boolean;
  /** Timestamp of last password change */
  passwordChangedAt: TimestampString | null;
  /** User's preferred timezone */
  timezone?: string;
  /** User's preferred locale */
  locale?: string;
  /** URL to user's avatar image */
  avatarUrl?: string;
}

/** Credentials for user authentication */
export interface UserCredentials {
  /** User's email address */
  email: string;
  /** User's password (plain text, for validation only) */
  password: string;
}

// =============================================================================
// Session Types
// =============================================================================

/** Session status */
export type SessionStatus = "active" | "expired" | "revoked";

/**
 * User session representing an authenticated session.
 */
export interface Session extends BaseEntity {
  /** Associated user ID */
  userId: UUID;
  /** Current tenant context (if any) */
  tenantId: UUID | null;
  /** Session status */
  status: SessionStatus;
  /** Session token (hashed) */
  tokenHash: string;
  /** Refresh token (hashed) */
  refreshTokenHash: string;
  /** When the session expires */
  expiresAt: TimestampString;
  /** When the refresh token expires */
  refreshExpiresAt: TimestampString;
  /** IP address of the client */
  ipAddress: string;
  /** User agent string */
  userAgent: string;
  /** Device identifier (if available) */
  deviceId?: string;
  /** Last activity timestamp */
  lastActivityAt: TimestampString;
  /** Whether MFA was completed for this session */
  mfaVerified: boolean;
}

// =============================================================================
// MFA Types
// =============================================================================

/** MFA method types */
export type MfaMethod = "totp" | "sms" | "email" | "backup_codes";

/** Response when setting up MFA */
export interface MfaSetupResponse {
  /** The MFA method being set up */
  method: MfaMethod;
  /** Secret key for TOTP (base32 encoded) */
  secret?: string;
  /** QR code data URL for TOTP */
  qrCodeDataUrl?: string;
  /** Backup codes (only shown once during setup) */
  backupCodes?: string[];
  /** Phone number for SMS (masked) */
  phoneNumber?: string;
  /** Email for email-based MFA (masked) */
  email?: string;
}

/** Request to verify MFA code */
export interface MfaVerifyRequest {
  /** The MFA code entered by user */
  code: string;
  /** The MFA method being verified */
  method: MfaMethod;
  /** Session ID for the pending authentication */
  sessionId: UUID;
  /** Whether to remember this device */
  rememberDevice?: boolean;
}

/** MFA verification result */
export interface MfaVerifyResponse {
  /** Whether verification succeeded */
  success: boolean;
  /** Access token (if successful) */
  accessToken?: string;
  /** Refresh token (if successful) */
  refreshToken?: string;
  /** Error message (if failed) */
  error?: string;
  /** Remaining attempts before lockout */
  remainingAttempts?: number;
}

// =============================================================================
// Login Types
// =============================================================================

/** Login request */
export interface LoginRequest {
  /** User's email address */
  email: string;
  /** User's password */
  password: string;
  /** Tenant slug (optional for multi-tenant) */
  tenantSlug?: string;
  /** Whether to extend session duration */
  rememberMe?: boolean;
  /** Device identifier for device management */
  deviceId?: string;
}

/** Login response */
export interface LoginResponse {
  /** Whether login was successful */
  success: boolean;
  /** Access token (JWT) */
  accessToken?: string;
  /** Refresh token */
  refreshToken?: string;
  /** Token expiration timestamp */
  expiresAt?: TimestampString;
  /** The authenticated user */
  user?: User;
  /** Whether MFA is required */
  mfaRequired?: boolean;
  /** Available MFA methods */
  mfaMethods?: MfaMethod[];
  /** Temporary session ID for MFA flow */
  mfaSessionId?: string;
  /** Available tenants for the user */
  availableTenants?: Array<{
    id: UUID;
    name: string;
    slug: string;
  }>;
}

/** Token refresh request */
export interface RefreshTokenRequest {
  /** The refresh token */
  refreshToken: string;
}

/** Token refresh response */
export interface RefreshTokenResponse {
  /** New access token */
  accessToken: string;
  /** New refresh token (if rotated) */
  refreshToken?: string;
  /** Token expiration timestamp */
  expiresAt: TimestampString;
}

// =============================================================================
// Permission Types
// =============================================================================

/** Permission resource types */
export type PermissionResource =
  | "employees"
  | "users"
  | "roles"
  | "tenants"
  | "audit"
  | "settings"
  | "reports"
  | "timesheets"
  | "schedules"
  | "leave"
  | "workflows"
  | "cases"
  | "courses"
  | "requisitions"
  | "candidates"
  | "performance"
  | "compensation"
  | "org_units"
  | "positions";

/** Permission actions */
export type PermissionAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "manage"
  | "approve"
  | "export"
  | "import";

/**
 * Permission definition.
 * Format: resource:action or resource:action:scope
 */
export interface Permission extends TenantScopedEntity {
  /** Unique permission code (e.g., "employees:read") */
  code: string;
  /** Human-readable name */
  name: string;
  /** Description of what this permission allows */
  description: string;
  /** Resource type */
  resource: PermissionResource;
  /** Action type */
  action: PermissionAction;
  /** Module this permission belongs to */
  module: string;
  /** Whether this is a system-defined permission */
  isSystem: boolean;
}

/**
 * Permission constraint for row-level security.
 * Defines additional restrictions on a permission.
 */
export interface PermissionConstraint {
  /** Constraint type */
  type: "org_unit" | "cost_center" | "location" | "department" | "custom";
  /** Operator for the constraint */
  operator: "eq" | "in" | "hierarchy" | "self" | "reports";
  /** Value(s) for the constraint */
  value: string | string[];
  /** Field to apply constraint on */
  field?: string;
}

// =============================================================================
// Role Types
// =============================================================================

/** Role status */
export type RoleStatus = "active" | "inactive";

/**
 * Role definition with permissions.
 */
export interface Role extends TenantScopedEntity {
  /** Role name */
  name: string;
  /** Role description */
  description: string;
  /** Role status */
  status: RoleStatus;
  /** Whether this is a system-defined role */
  isSystem: boolean;
  /** Permission codes assigned to this role */
  permissionCodes: string[];
  /** Default constraints for this role */
  defaultConstraints?: PermissionConstraint[];
}

/**
 * Role assignment linking a user to a role.
 */
export interface RoleAssignment extends TenantScopedEntity {
  /** User ID */
  userId: UUID;
  /** Role ID */
  roleId: UUID;
  /** When the assignment becomes effective */
  effectiveFrom: string;
  /** When the assignment ends (null for indefinite) */
  effectiveTo: string | null;
  /** Additional constraints specific to this assignment */
  constraints?: PermissionConstraint[];
  /** User who assigned this role */
  assignedBy: UUID;
}

// =============================================================================
// Password Policy Types
// =============================================================================

/** Password policy configuration */
export interface PasswordPolicy {
  /** Minimum password length */
  minLength: number;
  /** Maximum password length */
  maxLength: number;
  /** Require uppercase letters */
  requireUppercase: boolean;
  /** Require lowercase letters */
  requireLowercase: boolean;
  /** Require numbers */
  requireNumbers: boolean;
  /** Require special characters */
  requireSpecialChars: boolean;
  /** List of allowed special characters */
  allowedSpecialChars: string;
  /** Number of previous passwords to check */
  passwordHistory: number;
  /** Maximum password age in days (0 for no expiry) */
  maxAgeDays: number;
  /** Minimum password age in days before change allowed */
  minAgeDays: number;
}

// =============================================================================
// API Key Types
// =============================================================================

/** API key status */
export type ApiKeyStatus = "active" | "revoked" | "expired";

/**
 * API key for programmatic access.
 */
export interface ApiKey extends TenantScopedEntity {
  /** Key name/label */
  name: string;
  /** Key prefix (visible portion) */
  keyPrefix: string;
  /** Hashed key value */
  keyHash: string;
  /** Key status */
  status: ApiKeyStatus;
  /** When the key expires */
  expiresAt: TimestampString | null;
  /** Last time the key was used */
  lastUsedAt: TimestampString | null;
  /** Scopes/permissions for this key */
  scopes: string[];
  /** IP whitelist (empty for no restriction) */
  ipWhitelist: string[];
  /** User who created this key */
  createdBy: UUID;
}
