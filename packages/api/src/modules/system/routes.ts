import { Elysia } from "elysia";
import { requirePermission } from "../../plugins/rbac";

export const systemRoutes = new Elysia({ prefix: "/system" })
  .get(
    "/health",
    async (ctx) => {
      const { db, cache } = ctx as any;

      const dbHealth = await db.healthCheck();
      const redisHealth = await cache.healthCheck();

      const services = [
        {
          name: "database",
          status: dbHealth.status === "up" ? ("healthy" as const) : ("down" as const),
          latency: dbHealth.latency,
        },
        {
          name: "redis",
          status: redisHealth.status === "up" ? ("healthy" as const) : ("down" as const),
          latency: redisHealth.latency,
        },
      ];

      const allHealthy = services.every((s) => s.status === "healthy");
      const anyDown = services.some((s) => s.status === "down");

      const status = allHealthy
        ? ("healthy" as const)
        : anyDown
          ? ("down" as const)
          : ("degraded" as const);

      return { status, services };
    },
    {
      // Tie system health visibility to the dashboard read permission
      // (admin dashboard calls this endpoint)
      beforeHandle: [requirePermission("dashboards", "read")],
      detail: {
        tags: ["System"],
        summary: "System health",
        description: "Health for internal services used by the platform",
      },
    }
  );

export type SystemRoutes = typeof systemRoutes;
