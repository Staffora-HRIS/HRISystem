/**
 * Tenant Provisioning Module
 *
 * Provides automated tenant setup with:
 * - Tenant record creation with default settings
 * - Default role provisioning (tenant_admin, hr_manager, line_manager, employee)
 * - Admin user creation across all auth tables
 * - Optional demo data seeding (leave types, org structure)
 * - Welcome email via domain event
 * - Step-by-step provisioning log tracking
 *
 * Usage:
 * ```typescript
 * import { tenantProvisioningRoutes } from './modules/tenant-provisioning';
 *
 * const app = new Elysia()
 *   .use(tenantProvisioningRoutes);
 * ```
 */

// Export routes
export { tenantProvisioningRoutes, type TenantProvisioningRoutes } from "./routes";

// Export service
export { TenantProvisioningService } from "./service";

// Export repository
export { TenantProvisioningRepository } from "./repository";

// Export schemas
export {
  UuidSchema,
  ProvisioningStatusSchema,
  ProvisionTenantSchema,
  ListProvisioningLogsQuerySchema,
  type ProvisioningStatus,
  type ProvisionTenant,
  type ListProvisioningLogsQuery,
  type ProvisioningStepResponse,
  type ProvisioningLogResponse,
  type ProvisionTenantResponse,
} from "./schemas";
