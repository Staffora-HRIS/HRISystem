/**
 * System Module - Service Layer
 *
 * Implements business logic for system operations.
 * Currently provides health check aggregation across infrastructure services.
 */

import type { ServiceHealth, SystemHealthResponse } from "./schemas";

// =============================================================================
// Types
// =============================================================================

interface HealthCheckResult {
  status: string;
  latency: number;
}

interface HealthCheckable {
  healthCheck: () => Promise<HealthCheckResult>;
}

// =============================================================================
// Service
// =============================================================================

export class SystemService {
  constructor(
    private db: HealthCheckable,
    private cache: HealthCheckable
  ) {}

  /**
   * Aggregate health status from all infrastructure services.
   * Returns overall status and per-service details.
   */
  async getHealth(): Promise<SystemHealthResponse> {
    const dbHealth = await this.db.healthCheck();
    const redisHealth = await this.cache.healthCheck();

    const services: ServiceHealth[] = [
      {
        name: "database",
        status: dbHealth.status === "up" ? "healthy" : "down",
        latency: dbHealth.latency,
      },
      {
        name: "redis",
        status: redisHealth.status === "up" ? "healthy" : "down",
        latency: redisHealth.latency,
      },
    ];

    const allHealthy = services.every((s) => s.status === "healthy");
    const anyDown = services.some((s) => s.status === "down");

    const status: SystemHealthResponse["status"] = allHealthy
      ? "healthy"
      : anyDown
        ? "down"
        : "degraded";

    return { status, services };
  }
}
