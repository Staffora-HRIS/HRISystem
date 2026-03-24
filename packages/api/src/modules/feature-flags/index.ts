/**
 * Feature Flags Module
 *
 * Provides tenant-scoped feature flags with percentage rollout,
 * role-based gating, and Redis-backed evaluation.
 *
 * Usage:
 * ```typescript
 * import { featureFlagAdminRoutes, featureFlagEvalRoutes } from './modules/feature-flags';
 *
 * const app = new Elysia()
 *   .use(featureFlagAdminRoutes)
 *   .use(featureFlagEvalRoutes);
 * ```
 */

// Export routes
export {
  featureFlagAdminRoutes,
  featureFlagEvalRoutes,
  type FeatureFlagAdminRoutes,
  type FeatureFlagEvalRoutes,
} from "./routes";

// Export schemas
export {
  UuidSchema,
  CreateFeatureFlagSchema,
  UpdateFeatureFlagSchema,
  FeatureFlagResponseSchema,
  FeatureFlagEvalResponseSchema,
  IdParamsSchema,
  FlagNameQuerySchema,
  type CreateFeatureFlag,
  type UpdateFeatureFlag,
  type FeatureFlagResponse,
  type FeatureFlagEvalResponse,
  type IdParams,
  type FlagNameQuery,
} from "./schemas";
