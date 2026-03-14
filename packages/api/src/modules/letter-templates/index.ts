/**
 * Letter Templates Module
 *
 * Provides the complete API layer for letter template operations including:
 * - Letter template CRUD (create, read, update)
 * - Letter generation from templates with placeholder rendering
 * - Generated letter listing and retrieval
 *
 * Usage:
 * ```typescript
 * import { letterTemplateRoutes } from './modules/letter-templates';
 *
 * const app = new Elysia()
 *   .use(letterTemplateRoutes);
 * ```
 */

// Export routes
export { letterTemplateRoutes, type LetterTemplateRoutes } from "./routes";

// Export service
export { LetterTemplatesService } from "./service";
export type { ServiceResult, PaginatedServiceResult, TenantContext as ServiceTenantContext } from "../../types/service-result";

// Export repository
export {
  LetterTemplatesRepository,
  type TenantContext,
  type PaginatedResult,
  type LetterTemplateRow,
  type GeneratedLetterRow,
} from "./repository";

// Export schemas
export {
  // Enums
  LetterTemplateTypeSchema,
  SentViaSchema,
  // Common
  UuidSchema,
  PaginationQuerySchema,
  // Templates
  PlaceholderDefSchema,
  CreateLetterTemplateSchema,
  UpdateLetterTemplateSchema,
  LetterTemplateResponseSchema,
  LetterTemplateFiltersSchema,
  // Generation
  GenerateLetterSchema,
  GeneratedLetterResponseSchema,
  GeneratedLetterFiltersSchema,
  // Params
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type LetterTemplateType,
  type SentVia,
  type PaginationQuery,
  type PlaceholderDef,
  type CreateLetterTemplate,
  type UpdateLetterTemplate,
  type LetterTemplateResponse,
  type LetterTemplateFilters,
  type GenerateLetter,
  type GeneratedLetterResponse,
  type GeneratedLetterFilters,
  type IdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
