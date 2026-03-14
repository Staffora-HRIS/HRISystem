/**
 * Health & Safety Module
 *
 * Provides the complete API layer for Health & Safety operations
 * covering UK statutory requirements:
 *
 * - Accident Book / Incident Recording (Health and Safety at Work Act 1974)
 * - RIDDOR Reporting (Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013)
 * - Risk Assessments (Management of Health and Safety at Work Regulations 1999)
 * - DSE Assessments (Health and Safety (Display Screen Equipment) Regulations 1992)
 *
 * Usage:
 * ```typescript
 * import { healthSafetyRoutes } from './modules/health-safety';
 *
 * const app = new Elysia()
 *   .use(healthSafetyRoutes);
 * ```
 */

// Export routes
export { healthSafetyRoutes, type HealthSafetyRoutes } from "./routes";

// Export service
export { HealthSafetyService } from "./service";

// Export repository
export {
  HealthSafetyRepository,
  type TenantContext,
  type PaginatedResult,
  type IncidentRow,
  type RiskAssessmentRow,
  type DSEAssessmentRow,
} from "./repository";

// Export schemas
export {
  // Enums
  IncidentSeveritySchema,
  IncidentStatusSchema,
  RiskAssessmentStatusSchema,
  RiskLevelSchema,
  DSEStatusSchema,
  // Common
  UuidSchema,
  DateSchema,
  DateTimeSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Hazard
  HazardEntrySchema,
  // Incident
  CreateIncidentSchema,
  UpdateIncidentSchema,
  IncidentFiltersSchema,
  IncidentResponseSchema,
  // Risk Assessment
  CreateRiskAssessmentSchema,
  UpdateRiskAssessmentSchema,
  RiskAssessmentFiltersSchema,
  RiskAssessmentResponseSchema,
  // DSE
  CreateDSEAssessmentSchema,
  UpdateDSEAssessmentSchema,
  DSEAssessmentFiltersSchema,
  DSEAssessmentResponseSchema,
  // Dashboard
  DashboardResponseSchema,
  // Types
  type IncidentSeverity,
  type IncidentStatus,
  type RiskAssessmentStatus,
  type RiskLevel,
  type DSEStatus,
  type PaginationQuery,
  type IdParams,
  type HazardEntry,
  type CreateIncident,
  type UpdateIncident,
  type IncidentFilters,
  type IncidentResponse,
  type CreateRiskAssessment,
  type UpdateRiskAssessment,
  type RiskAssessmentFilters,
  type RiskAssessmentResponse,
  type CreateDSEAssessment,
  type UpdateDSEAssessment,
  type DSEAssessmentFilters,
  type DSEAssessmentResponse,
  type DashboardResponse,
} from "./schemas";
