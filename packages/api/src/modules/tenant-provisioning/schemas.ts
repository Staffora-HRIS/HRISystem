/**
 * Tenant Provisioning Module - TypeBox Schemas
 *
 * Validation schemas for the automated tenant provisioning endpoint.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Shared Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

export const ProvisioningStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("failed"),
  t.Literal("rolled_back"),
]);
export type ProvisioningStatus = Static<typeof ProvisioningStatusSchema>;

// =============================================================================
// Provision Tenant Request
// =============================================================================

export const ProvisionTenantSchema = t.Object({
  /** Display name of the organization */
  name: t.String({ minLength: 2, maxLength: 255 }),
  /** URL-safe slug (auto-generated if not provided) */
  slug: t.Optional(
    t.String({ minLength: 2, maxLength: 100, pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$" })
  ),
  /** Admin user email for the new tenant */
  adminEmail: t.String({ format: "email" }),
  /** Admin user's first name */
  adminFirstName: t.String({ minLength: 1, maxLength: 100 }),
  /** Admin user's last name */
  adminLastName: t.String({ minLength: 1, maxLength: 100 }),
  /** Admin user's temporary password (minimum 12 chars) */
  adminPassword: t.String({ minLength: 12, maxLength: 128 }),
  /** Optional tenant settings to apply */
  settings: t.Optional(t.Record(t.String(), t.Unknown())),
  /** Whether to seed demo data */
  seedDemoData: t.Optional(t.Boolean()),
  /** Whether to send welcome email to admin */
  sendWelcomeEmail: t.Optional(t.Boolean()),
});
export type ProvisionTenant = Static<typeof ProvisionTenantSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

export const ListProvisioningLogsQuerySchema = t.Object({
  status: t.Optional(ProvisioningStatusSchema),
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.String({ pattern: "^[0-9]+$" })),
});
export type ListProvisioningLogsQuery = Static<typeof ListProvisioningLogsQuerySchema>;

// =============================================================================
// Response Types
// =============================================================================

export interface ProvisioningStepResponse {
  step: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  error?: string;
}

export interface ProvisioningLogResponse {
  id: string;
  tenantId: string;
  status: string;
  steps: ProvisioningStepResponse[];
  initiatedBy: string | null;
  config: Record<string, unknown>;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface ProvisionTenantResponse {
  tenantId: string;
  tenantSlug: string;
  provisioningLogId: string;
  status: string;
  adminUserId: string;
  steps: ProvisioningStepResponse[];
}
