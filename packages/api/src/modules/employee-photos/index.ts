/**
 * Employee Photos Module
 *
 * Provides the complete API layer for managing employee profile photos.
 * Each employee can have at most one photo (enforced by DB unique constraint).
 *
 * Usage:
 * ```typescript
 * import { employeePhotoRoutes } from './modules/employee-photos';
 *
 * const app = new Elysia()
 *   .use(employeePhotoRoutes);
 * ```
 */

// Export routes
export { employeePhotoRoutes, type EmployeePhotoRoutes } from "./routes";

// Export service
export { EmployeePhotosService } from "./service";
export type { ServiceResult, TenantContext as ServiceTenantContext } from "../../types/service-result";

// Export repository
export {
  EmployeePhotosRepository,
  type TenantContext,
  type EmployeePhotoRow,
} from "./repository";

// Export schemas
export {
  // Common
  UuidSchema,
  // Params
  EmployeeIdParamsSchema,
  // Headers
  OptionalIdempotencyHeaderSchema,
  // Request
  UploadPhotoSchema,
  // Response
  PhotoResponseSchema,
  // Types
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
  type UploadPhoto,
  type PhotoResponse,
} from "./schemas";
