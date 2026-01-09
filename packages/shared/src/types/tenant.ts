/**
 * Tenant Types
 *
 * Type definitions for multi-tenancy, tenant settings,
 * and tenant-user relationships.
 */

import type { UUID, TimestampString, BaseEntity } from "./common";

// =============================================================================
// Tenant Status Types
// =============================================================================

/** Tenant account status */
export type TenantStatus = "active" | "suspended" | "pending" | "trial" | "cancelled";

/** Tenant subscription tier */
export type TenantTier = "free" | "starter" | "professional" | "enterprise";

// =============================================================================
// Tenant Types
// =============================================================================

/**
 * Tenant entity representing an organization/company.
 */
export interface Tenant extends BaseEntity {
  /** Tenant name */
  name: string;
  /** URL-friendly slug (unique) */
  slug: string;
  /** Current account status */
  status: TenantStatus;
  /** Subscription tier */
  tier: TenantTier;
  /** Tenant settings */
  settings: TenantSettings;
  /** Primary domain for the tenant */
  domain?: string;
  /** Logo URL */
  logoUrl?: string;
  /** Favicon URL */
  faviconUrl?: string;
  /** Primary contact email */
  contactEmail: string;
  /** Primary contact phone */
  contactPhone?: string;
  /** Trial end date (if on trial) */
  trialEndsAt?: TimestampString;
  /** Subscription start date */
  subscriptionStartAt?: TimestampString;
  /** Subscription end date */
  subscriptionEndAt?: TimestampString;
  /** Maximum allowed employees */
  maxEmployees?: number;
  /** Maximum allowed users */
  maxUsers?: number;
  /** Enabled feature flags */
  features: TenantFeatures;
  /** Billing information */
  billing?: TenantBilling;
}

/**
 * Tenant settings configuration.
 */
export interface TenantSettings {
  /** Default timezone for the tenant */
  timezone: string;
  /** Date format pattern (e.g., "MM/DD/YYYY", "DD/MM/YYYY") */
  dateFormat: string;
  /** Time format (12h or 24h) */
  timeFormat: "12h" | "24h";
  /** Default currency code (ISO 4217) */
  currency: string;
  /** Default locale code */
  locale: string;
  /** Fiscal year start month (1-12) */
  fiscalYearStartMonth: number;
  /** Week start day (0 = Sunday, 1 = Monday) */
  weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Default working days per week */
  workingDaysPerWeek: number[];
  /** Default working hours per day */
  workingHoursPerDay: number;
  /** Session timeout in minutes */
  sessionTimeoutMinutes: number;
  /** Enable employee self-service portal */
  selfServiceEnabled: boolean;
  /** Custom branding settings */
  branding?: TenantBranding;
  /** Notification settings */
  notifications?: TenantNotificationSettings;
  /** Integration settings */
  integrations?: TenantIntegrationSettings;
}

/**
 * Tenant feature flags.
 */
export interface TenantFeatures {
  /** Require MFA for all users */
  mfaRequired: boolean;
  /** Allow SSO authentication */
  ssoEnabled: boolean;
  /** Allow API access */
  apiAccess: boolean;
  /** Enable audit logging */
  auditEnabled: boolean;
  /** Enable time & attendance module */
  timeAttendanceEnabled: boolean;
  /** Enable absence management module */
  absenceManagementEnabled: boolean;
  /** Enable payroll module */
  payrollEnabled: boolean;
  /** Enable performance management module */
  performanceEnabled: boolean;
  /** Enable learning management module */
  lmsEnabled: boolean;
  /** Enable talent acquisition module */
  recruitingEnabled: boolean;
  /** Enable onboarding module */
  onboardingEnabled: boolean;
  /** Enable case management module */
  caseManagementEnabled: boolean;
  /** Enable analytics module */
  analyticsEnabled: boolean;
  /** Enable custom fields */
  customFieldsEnabled: boolean;
  /** Enable workflow automation */
  workflowsEnabled: boolean;
  /** Enable document management */
  documentsEnabled: boolean;
  /** Enable mobile app access */
  mobileAppEnabled: boolean;
  /** Enable advanced reporting */
  advancedReportingEnabled: boolean;
}

/**
 * Tenant branding customization.
 */
export interface TenantBranding {
  /** Primary brand color (hex) */
  primaryColor: string;
  /** Secondary brand color (hex) */
  secondaryColor?: string;
  /** Accent color (hex) */
  accentColor?: string;
  /** Logo URL for light backgrounds */
  logoLight?: string;
  /** Logo URL for dark backgrounds */
  logoDark?: string;
  /** Custom CSS for additional styling */
  customCss?: string;
  /** Custom login page message */
  loginMessage?: string;
}

/**
 * Tenant notification settings.
 */
export interface TenantNotificationSettings {
  /** Enable email notifications */
  emailEnabled: boolean;
  /** Enable in-app notifications */
  inAppEnabled: boolean;
  /** Enable push notifications */
  pushEnabled: boolean;
  /** Enable SMS notifications */
  smsEnabled: boolean;
  /** Default email sender name */
  emailSenderName?: string;
  /** Default email sender address */
  emailSenderAddress?: string;
  /** Email footer text */
  emailFooter?: string;
}

/**
 * Tenant integration settings.
 */
export interface TenantIntegrationSettings {
  /** SSO configuration */
  sso?: SsoConfiguration;
  /** HRIS integrations */
  hrisIntegrations?: string[];
  /** Payroll integrations */
  payrollIntegrations?: string[];
  /** Communication integrations (Slack, Teams, etc.) */
  communicationIntegrations?: string[];
}

/**
 * SSO configuration.
 */
export interface SsoConfiguration {
  /** SSO provider type */
  provider: "saml" | "oidc" | "azure_ad" | "okta" | "google";
  /** Whether SSO is enabled */
  enabled: boolean;
  /** SSO entity ID / client ID */
  entityId?: string;
  /** SSO metadata URL */
  metadataUrl?: string;
  /** SSO login URL */
  loginUrl?: string;
  /** SSO logout URL */
  logoutUrl?: string;
  /** SSO certificate */
  certificate?: string;
  /** Force SSO for all users */
  forceSso: boolean;
  /** Allow password login as fallback */
  allowPasswordFallback: boolean;
  /** Attribute mappings */
  attributeMappings?: Record<string, string>;
}

/**
 * Tenant billing information.
 */
export interface TenantBilling {
  /** Billing contact name */
  contactName: string;
  /** Billing contact email */
  contactEmail: string;
  /** Billing address */
  address?: {
    street1: string;
    street2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  /** Tax ID / VAT number */
  taxId?: string;
  /** Payment method on file */
  paymentMethod?: "card" | "invoice" | "ach";
  /** Last 4 digits of card (if applicable) */
  cardLast4?: string;
}

// =============================================================================
// User-Tenant Relationship Types
// =============================================================================

/** User's role within a tenant */
export type TenantUserRole = "owner" | "admin" | "member";

/**
 * User-tenant relationship.
 */
export interface UserTenant extends BaseEntity {
  /** User ID */
  userId: UUID;
  /** Tenant ID */
  tenantId: UUID;
  /** User's role in this tenant */
  role: TenantUserRole;
  /** Whether this is the user's default tenant */
  isDefault: boolean;
  /** Date user joined the tenant */
  joinedAt: TimestampString;
  /** User who invited this user */
  invitedBy?: UUID;
  /** Custom data for this user-tenant relationship */
  metadata?: Record<string, unknown>;
}

/**
 * Tenant context for request scoping.
 * Used to scope all data access to a specific tenant.
 */
export interface TenantContext {
  /** Current tenant ID */
  tenantId: UUID;
  /** Current tenant slug */
  tenantSlug: string;
  /** Current tenant name */
  tenantName: string;
  /** Tenant settings */
  settings: TenantSettings;
  /** Enabled features */
  features: TenantFeatures;
  /** Current user's role in this tenant */
  userRole: TenantUserRole;
  /** Current user's permissions in this tenant */
  permissions: string[];
}

// =============================================================================
// Tenant Invitation Types
// =============================================================================

/** Invitation status */
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

/**
 * Tenant invitation for new users.
 */
export interface TenantInvitation extends BaseEntity {
  /** Tenant ID */
  tenantId: UUID;
  /** Invited email address */
  email: string;
  /** Role to assign upon acceptance */
  role: TenantUserRole;
  /** Invitation status */
  status: InvitationStatus;
  /** Invitation token (hashed) */
  tokenHash: string;
  /** When the invitation expires */
  expiresAt: TimestampString;
  /** User who sent the invitation */
  invitedBy: UUID;
  /** Custom message included with invitation */
  message?: string;
  /** Roles to assign upon acceptance */
  roleIds?: UUID[];
}
