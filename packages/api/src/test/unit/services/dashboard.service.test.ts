/**
 * Dashboard Service Unit Tests
 *
 * Tests the DashboardService with a mocked DashboardRepository and CacheClient.
 * Verifies response formatting, default value handling, caching behavior,
 * and error propagation through the service layer.
 */

import { describe, it, expect } from "bun:test";
import { DashboardService } from "../../../modules/dashboard/service";
import type { DashboardRepository, AdminStatsData, RecentActivityRow } from "../../../modules/dashboard/repository";
import type { TenantContext } from "../../../types/service-result";
import type { CacheClient } from "../../../plugins/cache";

// =============================================================================
// Helpers
// =============================================================================

const testCtx: TenantContext = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
};

const defaultStats: AdminStatsData = {
  totalEmployees: 0,
  activeEmployees: 0,
  departments: 0,
  openPositions: 0,
  pendingWorkflows: 0,
  pendingApprovals: 0,
};

const sampleStats: AdminStatsData = {
  totalEmployees: 150,
  activeEmployees: 130,
  departments: 8,
  openPositions: 12,
  pendingWorkflows: 5,
  pendingApprovals: 3,
};

const sampleActivity: RecentActivityRow[] = [
  {
    id: "a1",
    action: "hr.employee.created",
    resourceType: "employee",
    resourceId: "emp-1",
    userId: testCtx.userId!,
    createdAt: new Date("2026-03-13T10:00:00Z"),
    metadata: null,
  },
  {
    id: "a2",
    action: "hr.employee.updated",
    resourceType: "employee",
    resourceId: "emp-2",
    userId: testCtx.userId!,
    createdAt: new Date("2026-03-13T09:00:00Z"),
    metadata: { field: "status" },
  },
];

function createMockRepository(
  overrides: Partial<DashboardRepository> = {}
): DashboardRepository {
  return {
    getAdminStats: overrides.getAdminStats ?? (async () => ({ ...defaultStats })),
    getRecentActivity: overrides.getRecentActivity ?? (async () => []),
  } as DashboardRepository;
}

/**
 * Create a mock CacheClient that tracks get/set calls.
 */
function createMockCache(
  overrides: {
    getResult?: unknown;
    shouldThrowOnGet?: boolean;
    shouldThrowOnSet?: boolean;
  } = {}
): { cache: CacheClient; calls: { gets: string[]; sets: Array<{ key: string; value: unknown; ttl: number }> } } {
  const calls = {
    gets: [] as string[],
    sets: [] as Array<{ key: string; value: unknown; ttl: number }>,
  };

  const cache = {
    get: async (key: string) => {
      calls.gets.push(key);
      if (overrides.shouldThrowOnGet) {
        throw new Error("Cache read error");
      }
      return overrides.getResult !== undefined ? overrides.getResult : null;
    },
    set: async (key: string, value: unknown, ttl: number) => {
      if (overrides.shouldThrowOnSet) {
        throw new Error("Cache write error");
      }
      calls.sets.push({ key, value, ttl });
    },
  } as unknown as CacheClient;

  return { cache, calls };
}

// =============================================================================
// Tests - getAdminStats
// =============================================================================

describe("DashboardService", () => {
  describe("getAdminStats", () => {
    it("should return stats from repository on success", async () => {
      const repo = createMockRepository({
        getAdminStats: async () => sampleStats,
      });
      const service = new DashboardService(repo);

      const result = await service.getAdminStats(testCtx);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleStats);
    });

    it("should return all zero stats when repository returns zeros", async () => {
      const repo = createMockRepository();
      const service = new DashboardService(repo);

      const result = await service.getAdminStats(testCtx);

      expect(result.success).toBe(true);
      expect(result.data?.totalEmployees).toBe(0);
      expect(result.data?.activeEmployees).toBe(0);
      expect(result.data?.departments).toBe(0);
      expect(result.data?.openPositions).toBe(0);
      expect(result.data?.pendingWorkflows).toBe(0);
      expect(result.data?.pendingApprovals).toBe(0);
    });

    it("should return error result when repository throws", async () => {
      const repo = createMockRepository({
        getAdminStats: async () => {
          throw new Error("Connection timeout");
        },
      });
      const service = new DashboardService(repo);

      const result = await service.getAdminStats(testCtx);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INTERNAL_ERROR");
      expect(result.error?.message).toBe("Connection timeout");
    });

    it("should handle non-Error exceptions gracefully", async () => {
      const repo = createMockRepository({
        getAdminStats: async () => {
          throw "unexpected string error";
        },
      });
      const service = new DashboardService(repo);

      const result = await service.getAdminStats(testCtx);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INTERNAL_ERROR");
      expect(result.error?.message).toBe("Failed to fetch dashboard stats");
    });

    it("should have exactly 6 fields in the successful response data", async () => {
      const repo = createMockRepository({
        getAdminStats: async () => sampleStats,
      });
      const service = new DashboardService(repo);

      const result = await service.getAdminStats(testCtx);

      expect(result.success).toBe(true);
      const keys = Object.keys(result.data!);
      expect(keys).toHaveLength(6);
      expect(keys).toContain("totalEmployees");
      expect(keys).toContain("activeEmployees");
      expect(keys).toContain("departments");
      expect(keys).toContain("openPositions");
      expect(keys).toContain("pendingWorkflows");
      expect(keys).toContain("pendingApprovals");
    });

    it("should return correct types for all stat fields", async () => {
      const repo = createMockRepository({
        getAdminStats: async () => sampleStats,
      });
      const service = new DashboardService(repo);

      const result = await service.getAdminStats(testCtx);

      expect(result.success).toBe(true);
      for (const value of Object.values(result.data!)) {
        expect(typeof value).toBe("number");
      }
    });

    it("should pass tenant context through to repository", async () => {
      let capturedCtx: TenantContext | null = null;

      const repo = createMockRepository({
        getAdminStats: async (ctx) => {
          capturedCtx = ctx;
          return { ...defaultStats };
        },
      });
      const service = new DashboardService(repo);

      await service.getAdminStats(testCtx);

      expect(capturedCtx).not.toBeNull();
      expect(capturedCtx!.tenantId).toBe(testCtx.tenantId);
      expect(capturedCtx!.userId).toBe(testCtx.userId);
    });

    // =========================================================================
    // Caching Tests
    // =========================================================================

    it("should return cached stats when cache hit occurs", async () => {
      const repo = createMockRepository({
        getAdminStats: async () => {
          throw new Error("should not be called");
        },
      });
      const { cache } = createMockCache({ getResult: sampleStats });
      const service = new DashboardService(repo, cache);

      const result = await service.getAdminStats(testCtx);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleStats);
    });

    it("should query repository on cache miss and populate cache", async () => {
      const repo = createMockRepository({
        getAdminStats: async () => sampleStats,
      });
      const { cache, calls } = createMockCache();
      const service = new DashboardService(repo, cache);

      const result = await service.getAdminStats(testCtx);

      // Wait for fire-and-forget cache set
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleStats);
      expect(calls.gets).toHaveLength(1);
      expect(calls.sets).toHaveLength(1);
      expect(calls.sets[0]!.ttl).toBe(60); // CacheTTL.SHORT
    });

    it("should fall through to database when cache read fails", async () => {
      const repo = createMockRepository({
        getAdminStats: async () => sampleStats,
      });
      const { cache } = createMockCache({ shouldThrowOnGet: true });
      const service = new DashboardService(repo, cache);

      const result = await service.getAdminStats(testCtx);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleStats);
    });

    it("should still return data when cache write fails", async () => {
      const repo = createMockRepository({
        getAdminStats: async () => sampleStats,
      });
      const { cache } = createMockCache({ shouldThrowOnSet: true });
      const service = new DashboardService(repo, cache);

      const result = await service.getAdminStats(testCtx);

      // Wait for fire-and-forget cache set to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleStats);
    });

    it("should work without cache (null cache)", async () => {
      const repo = createMockRepository({
        getAdminStats: async () => sampleStats,
      });
      const service = new DashboardService(repo, null);

      const result = await service.getAdminStats(testCtx);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleStats);
    });
  });

  // ===========================================================================
  // Tests - getRecentActivity
  // ===========================================================================

  describe("getRecentActivity", () => {
    it("should return activity from repository on success", async () => {
      const repo = createMockRepository({
        getRecentActivity: async () => sampleActivity,
      });
      const service = new DashboardService(repo);

      const result = await service.getRecentActivity(testCtx, 10);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleActivity);
      expect(result.data).toHaveLength(2);
    });

    it("should return empty array when no activity exists", async () => {
      const repo = createMockRepository();
      const service = new DashboardService(repo);

      const result = await service.getRecentActivity(testCtx);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should return error result when repository throws", async () => {
      const repo = createMockRepository({
        getRecentActivity: async () => {
          throw new Error("Query failed");
        },
      });
      const service = new DashboardService(repo);

      const result = await service.getRecentActivity(testCtx);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INTERNAL_ERROR");
      expect(result.error?.message).toBe("Query failed");
    });

    it("should pass limit to repository", async () => {
      let capturedLimit: number | null = null;

      const repo = createMockRepository({
        getRecentActivity: async (_ctx, limit) => {
          capturedLimit = limit;
          return [];
        },
      });
      const service = new DashboardService(repo);

      await service.getRecentActivity(testCtx, 25);

      expect(capturedLimit).toBe(25);
    });

    it("should use default limit of 10", async () => {
      let capturedLimit: number | null = null;

      const repo = createMockRepository({
        getRecentActivity: async (_ctx, limit) => {
          capturedLimit = limit;
          return [];
        },
      });
      const service = new DashboardService(repo);

      await service.getRecentActivity(testCtx);

      expect(capturedLimit).toBe(10);
    });

    it("should return cached activity when cache hit occurs", async () => {
      const repo = createMockRepository({
        getRecentActivity: async () => {
          throw new Error("should not be called");
        },
      });
      const { cache } = createMockCache({ getResult: sampleActivity });
      const service = new DashboardService(repo, cache);

      const result = await service.getRecentActivity(testCtx, 10);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleActivity);
    });

    it("should populate cache on miss", async () => {
      const repo = createMockRepository({
        getRecentActivity: async () => sampleActivity,
      });
      const { cache, calls } = createMockCache();
      const service = new DashboardService(repo, cache);

      const result = await service.getRecentActivity(testCtx, 10);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.success).toBe(true);
      expect(calls.sets).toHaveLength(1);
      expect(calls.sets[0]!.ttl).toBe(60); // CacheTTL.SHORT
    });

    it("should fall through to database when cache read fails", async () => {
      const repo = createMockRepository({
        getRecentActivity: async () => sampleActivity,
      });
      const { cache } = createMockCache({ shouldThrowOnGet: true });
      const service = new DashboardService(repo, cache);

      const result = await service.getRecentActivity(testCtx, 10);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleActivity);
    });
  });
});
