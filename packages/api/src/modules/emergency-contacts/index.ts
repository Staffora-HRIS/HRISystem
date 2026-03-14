/**
 * Emergency Contacts Module
 *
 * Provides the complete API layer for managing employee emergency contacts.
 *
 * Usage:
 * ```typescript
 * import { emergencyContactRoutes } from './modules/emergency-contacts';
 *
 * const app = new Elysia()
 *   .use(emergencyContactRoutes);
 * ```
 */

// Export routes
export { emergencyContactRoutes, type EmergencyContactRoutes } from "./routes";

// Export service
export { EmergencyContactService } from "./service";
export type { ServiceResult, PaginatedServiceResult, TenantContext as ServiceTenantContext } from "../../types/service-result";

// Export repository
export {
  EmergencyContactRepository,
  type TenantContext,
  type PaginatedResult,
  type EmergencyContactRow,
} from "./repository";

// Export schemas
export {
  // Common
  UuidSchema,
  PaginationQuerySchema,
  // Params
  IdParamsSchema,
  EmployeeIdParamsSchema,
  // Headers
  OptionalIdempotencyHeaderSchema,
  // Request
  CreateEmergencyContactSchema,
  UpdateEmergencyContactSchema,
  // Response
  EmergencyContactResponseSchema,
  EmergencyContactListResponseSchema,
  // Types
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
  type CreateEmergencyContact,
  type UpdateEmergencyContact,
  type EmergencyContactResponse,
  type EmergencyContactListResponse,
} from "./schemas";
