/**
 * Benefits Exchange Module
 *
 * Exports all components for the Benefits Provider Data Exchange module including:
 * - Routes (Elysia plugin)
 * - Service (business logic)
 * - Repository (data access)
 * - Schemas (TypeBox validation schemas)
 */

// Route plugin (main entry point for app.ts)
export { benefitsExchangeRoutes } from "./routes";
export type { BenefitsExchangeRoutes } from "./routes";

// Service and Repository
export { BenefitsExchangeService } from "./service";
export { BenefitsExchangeRepository } from "./repository";

// Schemas
export * from "./schemas";
