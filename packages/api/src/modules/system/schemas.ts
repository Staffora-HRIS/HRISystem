/**
 * System Module - TypeBox Schemas
 *
 * Defines validation schemas for System API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Individual service health status
 */
export const ServiceHealthSchema = t.Object({
  name: t.String(),
  status: t.Union([
    t.Literal("healthy"),
    t.Literal("degraded"),
    t.Literal("down"),
  ]),
  latency: t.Number(),
});

export type ServiceHealth = Static<typeof ServiceHealthSchema>;

/**
 * Overall system health response
 */
export const SystemHealthResponseSchema = t.Object({
  status: t.Union([
    t.Literal("healthy"),
    t.Literal("degraded"),
    t.Literal("down"),
  ]),
  services: t.Array(ServiceHealthSchema),
});

export type SystemHealthResponse = Static<typeof SystemHealthResponseSchema>;
