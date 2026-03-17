/**
 * React Query Client Configuration Tests
 *
 * Tests for queryClient defaults, queryKeys factory, and invalidation helpers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to mock the api-client before importing query-client
vi.mock("../api-client", () => {
  return {
    api: {
      getTenantId: vi.fn(() => "tenant-123"),
      setTenantId: vi.fn(),
    },
    ApiClient: vi.fn(),
  };
});

describe("queryClient configuration", () => {
  let queryClient: typeof import("../query-client").queryClient;
  beforeEach(async () => {
    const mod = await import("../query-client");
    queryClient = mod.queryClient;
  });

  it("has default stale time of 5 minutes (medium)", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(5 * 60 * 1000);
  });

  it("has gc time of 10 minutes", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.gcTime).toBe(10 * 60 * 1000);
  });

  it("retries on 5xx errors (up to 3 times)", () => {
    const defaults = queryClient.getDefaultOptions();
    const retry = defaults.queries?.retry as (failureCount: number, error: unknown) => boolean;
    expect(retry(0, { status: 500 })).toBe(true);
    expect(retry(2, { status: 500 })).toBe(true);
    expect(retry(3, { status: 500 })).toBe(false);
  });

  it("does not retry on 4xx errors", () => {
    const defaults = queryClient.getDefaultOptions();
    const retry = defaults.queries?.retry as (failureCount: number, error: unknown) => boolean;
    expect(retry(0, { status: 400 })).toBe(false);
    expect(retry(0, { status: 401 })).toBe(false);
    expect(retry(0, { status: 404 })).toBe(false);
    expect(retry(0, { status: 422 })).toBe(false);
  });

  it("does not retry mutations", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.mutations?.retry).toBe(false);
  });

  it("enables refetch on window focus", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.refetchOnWindowFocus).toBe("always");
  });

  it("enables refetch on reconnect", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
  });
});

describe("STALE_TIMES constants", () => {
  let STALE_TIMES: typeof import("../query-client").STALE_TIMES;

  beforeEach(async () => {
    const mod = await import("../query-client");
    STALE_TIMES = mod.STALE_TIMES;
  });

  it("defines correct stale times", () => {
    expect(STALE_TIMES.short).toBe(30 * 1000);
    expect(STALE_TIMES.medium).toBe(5 * 60 * 1000);
    expect(STALE_TIMES.long).toBe(30 * 60 * 1000);
  });
});

describe("queryKeys factory", () => {
  let queryKeys: typeof import("../query-client").queryKeys;

  beforeEach(async () => {
    const mod = await import("../query-client");
    queryKeys = mod.queryKeys;
  });

  describe("tenant scoping", () => {
    it("includes tenant ID in scoped keys", () => {
      const key = queryKeys.auth.session();
      expect(key).toContain("tenant-123");
    });
  });

  describe("auth keys", () => {
    it("creates auth.all key", () => {
      expect(queryKeys.auth.all()).toEqual(["auth"]);
    });

    it("creates auth.session key", () => {
      const key = queryKeys.auth.session();
      expect(key[0]).toBe("auth");
      expect(key[1]).toBe("session");
    });

    it("creates auth.permissions key", () => {
      const key = queryKeys.auth.permissions();
      expect(key[0]).toBe("auth");
      expect(key[1]).toBe("permissions");
    });
  });

  describe("employees keys", () => {
    it("creates employees.all key", () => {
      const key = queryKeys.employees.all();
      expect(key[0]).toBe("employees");
    });

    it("creates employees.list key with filters", () => {
      const filters = { status: "active" };
      const key = queryKeys.employees.list(filters);
      expect(key).toContain("list");
      expect(key).toContain(filters);
    });

    it("creates employees.detail key", () => {
      const key = queryKeys.employees.detail("emp-1");
      expect(key).toContain("detail");
      expect(key).toContain("emp-1");
    });
  });

  describe("organization keys", () => {
    it("creates organization.departments key", () => {
      const key = queryKeys.organization.departments();
      expect(key[0]).toBe("organization");
    });

    it("creates organization.positions key", () => {
      const key = queryKeys.organization.positions();
      expect(key).toContain("positions");
    });
  });

  describe("leave keys", () => {
    it("creates leave.requests key with filters", () => {
      const key = queryKeys.leave.requests({ status: "pending" });
      expect(key).toContain("requests");
    });

    it("creates leave.balances key with employee ID", () => {
      const key = queryKeys.leave.balances("emp-1");
      expect(key).toContain("balances");
      expect(key).toContain("emp-1");
    });
  });

  describe("tenant keys", () => {
    it("creates tenant.current key", () => {
      const key = queryKeys.tenant.current();
      expect(key[0]).toBe("tenant");
      expect(key[1]).toBe("current");
    });

    it("creates tenant.settings key", () => {
      const key = queryKeys.tenant.settings();
      expect(key).toContain("settings");
    });
  });

  describe("manager keys", () => {
    it("creates manager.isManager key", () => {
      const key = queryKeys.manager.isManager();
      expect(key).toContain("is-manager");
    });

    it("creates manager.pendingApprovals key with type", () => {
      const key = queryKeys.manager.pendingApprovals("leave");
      expect(key).toContain("pending");
      expect(key).toContain("leave");
    });

    it("creates manager.teamAbsence key with date range", () => {
      const key = queryKeys.manager.teamAbsence("2024-01-01", "2024-01-31");
      expect(key).toContain("team-absence");
      expect(key).toContain("2024-01-01");
      expect(key).toContain("2024-01-31");
    });
  });

  describe("dashboard keys", () => {
    it("creates dashboard.stats key with type", () => {
      const key = queryKeys.dashboard.stats("employee");
      expect(key).toContain("stats");
      expect(key).toContain("employee");
    });
  });
});

describe("invalidationPatterns", () => {
  let invalidationPatterns: typeof import("../query-client").invalidationPatterns;

  beforeEach(async () => {
    const mod = await import("../query-client");
    invalidationPatterns = mod.invalidationPatterns;
  });

  it("returns employee invalidation patterns", () => {
    const patterns = invalidationPatterns.employee("emp-1");
    expect(patterns.length).toBeGreaterThanOrEqual(2);
  });

  it("returns leave request invalidation patterns", () => {
    const patterns = invalidationPatterns.leaveRequest();
    expect(patterns.length).toBeGreaterThanOrEqual(3);
  });

  it("returns security invalidation patterns", () => {
    const patterns = invalidationPatterns.security();
    expect(patterns.length).toBeGreaterThanOrEqual(2);
  });
});
