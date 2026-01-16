/**
 * Documents Module
 *
 * Exports all components for the Documents module including:
 * - Routes (Elysia plugin)
 * - Service (business logic)
 * - Repository (data access)
 * - Schemas (TypeBox validation schemas)
 */

export { documentsRoutes } from "./routes";
export { DocumentsService } from "./service";
export { DocumentsRepository } from "./repository";
export * from "./schemas";
