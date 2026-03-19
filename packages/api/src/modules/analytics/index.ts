/**
 * Analytics Module
 *
 * Exports all components for the Analytics module including:
 * - Routes (Elysia plugin)
 * - Service (business logic)
 * - Repository (data access)
 * - Schemas (TypeBox validation schemas)
 */

export { analyticsRoutes } from "./routes";
export { recruitmentAnalyticsRoutes } from "./recruitment-analytics.routes";
export { AnalyticsService } from "./service";
export { AnalyticsRepository } from "./repository";
export * from "./schemas";
