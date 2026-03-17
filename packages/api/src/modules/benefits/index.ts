/**
 * Benefits Administration Module
 *
 * Exports all components for the Benefits module including:
 * - Routes (Elysia plugin - composed from sub-route modules)
 * - Service (business logic)
 * - Repository (data access)
 * - Schemas (TypeBox validation schemas)
 *
 * Sub-route modules:
 * - carrier.routes.ts  -- carrier/provider CRUD
 * - plan.routes.ts     -- benefit plan CRUD
 * - enrollment.routes.ts -- enrollment, dependents, open enrollment, costs, self-service, stats
 * - life-event.routes.ts -- life event triggers, review, self-service
 */

// Composed route plugin (the main entry point for app.ts)
export { benefitsRoutes } from "./routes";
export type { BenefitsRoutes } from "./routes";

// Sub-route modules (for direct access if needed)
export { carrierRoutes } from "./carrier.routes";
export type { CarrierRoutes } from "./carrier.routes";
export { planRoutes } from "./plan.routes";
export type { PlanRoutes } from "./plan.routes";
export { enrollmentRoutes } from "./enrollment.routes";
export type { EnrollmentRoutes } from "./enrollment.routes";
export { lifeEventRoutes } from "./life-event.routes";
export type { LifeEventRoutes } from "./life-event.routes";

// Service and Repository
export { BenefitsService } from "./service";
export { BenefitsRepository } from "./repository";

// Schemas
export * from "./schemas";
