/**
 * Sickness Analytics Module
 *
 * Exports all components for the Sickness Analytics module including:
 * - Routes (Elysia plugin)
 * - Service (business logic)
 * - Repository (data access)
 * - Schemas (TypeBox validation schemas)
 */

export { sicknessAnalyticsRoutes } from "./routes";
export { SicknessAnalyticsService } from "./service";
export { SicknessAnalyticsRepository } from "./repository";
export * from "./schemas";
