/**
 * Calendar Sync Module
 *
 * Provides calendar integration for the Staffora HRIS platform.
 * Currently implements iCal feed generation for leave requests,
 * which works with all major calendar apps (Google Calendar,
 * Outlook, Apple Calendar) via subscription URLs.
 *
 * Usage:
 * ```typescript
 * import { calendarSyncRoutes } from './modules/calendar-sync';
 *
 * const app = new Elysia()
 *   .use(calendarSyncRoutes);
 * ```
 */

// Export routes
export { calendarSyncRoutes, type CalendarSyncRoutes } from "./routes";

// Export service
export { CalendarSyncService } from "./service";

// Export repository
export {
  CalendarSyncRepository,
  type TenantContext,
  type CalendarConnectionRow,
  type LeaveEventRow,
  type IcalConnectionInfo,
} from "./repository";

// Export schemas
export {
  UuidSchema,
  CalendarProviderSchema,
  CalendarConnectionResponseSchema,
  IcalEnableResponseSchema,
  IcalTokenParamsSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CalendarProvider,
  type CalendarConnectionResponse,
  type IcalEnableResponse,
  type IcalTokenParams,
  type IdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
