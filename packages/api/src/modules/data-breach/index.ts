/**
 * Data Breach Notification Module
 *
 * Provides the complete API layer for UK GDPR data breach notification
 * workflow including:
 * - Data breach register (Article 33(5))
 * - ICO 72-hour notification deadline tracking (Article 33)
 * - Individual notification tracking (Article 34)
 * - Risk assessment with ICO/subject notification determination
 * - Breach timeline / audit trail
 * - Dashboard with overdue alerts
 *
 * State machine: reported -> assessing -> ico_notified -> subjects_notified -> closed
 *                                      \-> remediation_only -> closed
 *
 * Usage:
 * ```typescript
 * import { dataBreachRoutes } from './modules/data-breach';
 *
 * const app = new Elysia()
 *   .use(dataBreachRoutes);
 * ```
 */

// Export routes
export { dataBreachRoutes, type DataBreachRoutes } from "./routes";

// Export service
export { DataBreachService } from "./service";

// Export repository
export {
  DataBreachRepository,
  type TenantContext,
  type PaginatedResult,
  type BreachRow,
  type TimelineEntryRow,
} from "./repository";

// Export schemas
export {
  // Enums
  BreachSeveritySchema,
  BreachStatusSchema,
  BreachCategorySchema,
  // Action schemas
  ReportBreachSchema,
  AssessBreachSchema,
  NotifyIcoSchema,
  NotifySubjectsSchema,
  CloseBreachSchema,
  CreateTimelineEntrySchema,
  // Filters
  BreachFiltersSchema,
  // Response
  BreachResponseSchema,
  TimelineEntryResponseSchema,
  BreachListResponseSchema,
  BreachDashboardResponseSchema,
  // Common
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Legacy (backward compat)
  CreateBreachSchema,
  UpdateBreachStatusSchema,
  // Types
  type BreachSeverity,
  type BreachStatus,
  type BreachCategory,
  type ReportBreach,
  type AssessBreach,
  type NotifyIco,
  type NotifySubjects,
  type CloseBreach,
  type CreateTimelineEntry,
  type BreachFilters,
  type BreachResponse,
  type TimelineEntryResponse,
  type BreachListResponse,
  type BreachDashboardResponse,
  type PaginationQuery,
  type IdParams,
  // Legacy types
  type CreateBreach,
  type UpdateBreachStatus,
} from "./schemas";
