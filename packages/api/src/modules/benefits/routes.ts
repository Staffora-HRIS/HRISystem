/**
 * Benefits Module - Elysia Routes (Composer)
 *
 * Composes all benefits sub-route modules under the /benefits prefix.
 * Each sub-module handles a specific domain area:
 *   - carrier.routes.ts  -- carrier/provider CRUD
 *   - plan.routes.ts     -- benefit plan CRUD
 *   - enrollment.routes.ts -- enrollment, dependents, open enrollment, costs, self-service, stats
 *   - life-event.routes.ts -- life event triggers, review, self-service
 *   - flex-fund.routes.ts -- Flexible benefit fund allocation
 *
 * Shared schemas and error maps live in routes.shared.ts and are
 * re-exported here for backward compatibility.
 *
 * Permission model:
 * - benefits:carriers: read, write
 * - benefits:plans: read, write
 * - benefits:enrollments: read, write
 * - benefits:dependents: read, write
 * - benefits:life_events: read, write, approve
 * - benefits:open_enrollment: read, write, admin
 * - benefits:flex_fund: read, write
 */

import { Elysia } from "elysia";
import { BenefitsRepository } from "./repository";
import { BenefitsService } from "./service";
import { carrierRoutes } from "./carrier.routes";
import { planRoutes } from "./plan.routes";
import { enrollmentRoutes } from "./enrollment.routes";
import { lifeEventRoutes } from "./life-event.routes";
import { flexFundRoutes } from "./flex-fund.routes";

// Re-export shared schemas for any external consumers
export {
  SuccessSchema,
  UuidSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  benefitsErrorStatusMap,
} from "./routes.shared";

// =============================================================================
// Benefits Routes Composer
// =============================================================================

/**
 * Create Benefits routes plugin.
 *
 * Derives the BenefitsService once at the top level, then composes
 * all sub-route modules which share the derived service context.
 */
export const benefitsRoutes = new Elysia({ prefix: "/benefits", name: "benefits-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new BenefitsRepository(db);
    const service = new BenefitsService(repository, db);

    return { benefitsService: service, benefitsRepository: repository };
  })

  // ===========================================================================
  // Compose Sub-Route Modules
  // ===========================================================================
  .use(carrierRoutes)
  .use(planRoutes)
  .use(enrollmentRoutes)
  .use(lifeEventRoutes)
  .use(flexFundRoutes);

export type BenefitsRoutes = typeof benefitsRoutes;
