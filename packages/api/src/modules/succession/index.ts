/**
 * Succession Planning Module
 *
 * Exports all components for the Succession Planning module including:
 * - Routes (Elysia plugin)
 * - Service (business logic)
 * - Repository (data access)
 * - Schemas (TypeBox validation schemas)
 */

export { successionRoutes } from "./routes";
export { SuccessionService } from "./service";
export { SuccessionRepository } from "./repository";
export * from "./schemas";
