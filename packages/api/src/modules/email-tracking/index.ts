/**
 * Email Tracking Module
 *
 * Provides email delivery monitoring, bounce handling, and delivery
 * statistics. Integrates with the notification worker to log email
 * lifecycle events (queued -> sent -> delivered/bounced/failed).
 *
 * Usage:
 * ```typescript
 * import { emailTrackingRoutes } from './modules/email-tracking';
 *
 * const app = new Elysia()
 *   .use(emailTrackingRoutes);
 * ```
 */

// Export routes
export { emailTrackingRoutes, type EmailTrackingRoutes } from "./routes";

// Export service (used by notification worker for write operations)
export { EmailTrackingService } from "./service";

// Export repository
export {
  EmailTrackingRepository,
  type TenantContext,
  type PaginatedResult,
  type EmailDeliveryLogRow,
  type EmailDeliveryStatsRow,
} from "./repository";

// Export schemas
export {
  UuidSchema,
  PaginationQuerySchema,
  EmailDeliveryStatusSchema,
  BounceTypeSchema,
  EmailDeliveryLogResponseSchema,
  EmailDeliveryFiltersSchema,
  EmailDeliveryStatsResponseSchema,
  EmailDeliveryStatsQuerySchema,
  RecordBounceSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type EmailDeliveryStatus,
  type BounceType,
  type EmailDeliveryLogResponse,
  type EmailDeliveryFilters,
  type EmailDeliveryStatsResponse,
  type EmailDeliveryStatsQuery,
  type RecordBounce,
  type IdParams,
  type OptionalIdempotencyHeader,
  type PaginationQuery,
} from "./schemas";
