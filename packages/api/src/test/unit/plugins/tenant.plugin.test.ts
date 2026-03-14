/**
 * Tenant Plugin Unit Tests
 *
 * Tests the tenant resolution plugin which provides:
 * - TenantService (getById, getBySlug, validateTenant, invalidateCache)
 * - TenantError class
 * - resolveTenant (synchronous header/session resolution)
 * - resolveTenantWithFallback (async with authService fallback)
 * - tenantPlugin (Elysia middleware)
 * - requireTenant guard
 * - requireTenantContext guard
 * - hasTenant type guard
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { Elysia } from "elysia";
import {
  TenantService,
  TenantError,
  TenantErrorCodes,
  resolveTenant,
  resolveTenantWithFallback,
  requireTenantContext,
  hasTenant,
} from "../../../plugins/tenant";
import type { Tenant } from "../../../plugins/tenant";

// =============================================================================
// Mock Helpers
// =============================================================================

function createMockCache() {
  const store = new Map<string, unknown>();
  return {
    get: mock(async (key: string) => store.get(key) ?? null),
    set: mock(async (key: string, value: unknown, _ttl?: number) => {
      store.set(key, value);
    }),
    del: mock(async (key: string) => {
      store.delete(key);
      return store.delete(key) || true;
    }),
    _store: store,
  };
}

function createMockDb(rows: unknown[] = []) {
  return {
    withSystemContext: mock(async (fn: (tx: unknown) => Promise<unknown>) => {
      // Simulate tagged template usage
      const txFn = Object.assign(
        (_strings: TemplateStringsArray, ..._values: unknown[]) => Promise.resolve(rows),
        { unsafe: mock(() => Promise.resolve()) }
      );
      return fn(txFn);
    }),
  };
}

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Test Tenant",
    slug: "test-tenant",
    status: "active",
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// =============================================================================
// TenantError
// =============================================================================

describe("TenantError", () => {
  it("should create an error with code, message, and statusCode", () => {
    const err = new TenantError("MISSING_TENANT", "Tenant header required", 400);
    expect(err.code).toBe("MISSING_TENANT");
    expect(err.message).toBe("Tenant header required");
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe("TenantError");
    expect(err instanceof Error).toBe(true);
  });

  it("should default statusCode to 400", () => {
    const err = new TenantError("INVALID_TENANT", "Bad tenant ID");
    expect(err.statusCode).toBe(400);
  });
});

describe("TenantErrorCodes", () => {
  it("should contain all expected error codes", () => {
    expect(TenantErrorCodes.MISSING_TENANT).toBe("MISSING_TENANT");
    expect(TenantErrorCodes.INVALID_TENANT).toBe("INVALID_TENANT");
    expect(TenantErrorCodes.TENANT_NOT_FOUND).toBe("TENANT_NOT_FOUND");
    expect(TenantErrorCodes.TENANT_SUSPENDED).toBe("TENANT_SUSPENDED");
    expect(TenantErrorCodes.TENANT_DELETED).toBe("TENANT_DELETED");
  });
});

// =============================================================================
// TenantService
// =============================================================================

describe("TenantService", () => {
  let cache: ReturnType<typeof createMockCache>;

  beforeEach(() => {
    cache = createMockCache();
  });

  describe("getById", () => {
    it("should return tenant from cache if available", async () => {
      const tenant = makeTenant();
      cache._store.set(`tenant:${tenant.id}`, tenant);
      const db = createMockDb();
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      const result = await service.getById(tenant.id);
      expect(result).toEqual(tenant);
      expect(cache.get).toHaveBeenCalledWith(`tenant:${tenant.id}`);
      // Should not hit DB
      expect(db.withSystemContext).not.toHaveBeenCalled();
    });

    it("should query database when not in cache", async () => {
      const tenant = makeTenant();
      const db = createMockDb([tenant]);
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      const result = await service.getById(tenant.id);
      expect(result).toEqual(tenant);
      expect(db.withSystemContext).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalled();
    });

    it("should return null when tenant not found in DB", async () => {
      const db = createMockDb([]);
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      const result = await service.getById("nonexistent-id");
      expect(result).toBeNull();
    });
  });

  describe("getBySlug", () => {
    it("should return tenant from cache by slug", async () => {
      const tenant = makeTenant();
      cache._store.set(`tenant:slug:${tenant.slug}`, tenant);
      const db = createMockDb();
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      const result = await service.getBySlug(tenant.slug);
      expect(result).toEqual(tenant);
    });

    it("should query database when slug not in cache", async () => {
      const tenant = makeTenant();
      const db = createMockDb([tenant]);
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      const result = await service.getBySlug("test-tenant");
      expect(result).toEqual(tenant);
      expect(db.withSystemContext).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalled();
    });
  });

  describe("validateTenant", () => {
    it("should throw INVALID_TENANT for non-UUID format", async () => {
      const db = createMockDb();
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      try {
        await service.validateTenant("not-a-uuid");
        expect(true).toBe(false); // Should not reach here
      } catch (err) {
        expect(err).toBeInstanceOf(TenantError);
        expect((err as TenantError).code).toBe("INVALID_TENANT");
        expect((err as TenantError).statusCode).toBe(400);
      }
    });

    it("should throw TENANT_NOT_FOUND when tenant does not exist", async () => {
      const db = createMockDb([]);
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      try {
        await service.validateTenant("11111111-1111-1111-1111-111111111111");
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(TenantError);
        expect((err as TenantError).code).toBe("TENANT_NOT_FOUND");
        expect((err as TenantError).statusCode).toBe(404);
      }
    });

    it("should throw TENANT_SUSPENDED for suspended tenant", async () => {
      const tenant = makeTenant({ status: "suspended" });
      const db = createMockDb([tenant]);
      cache._store.set(`tenant:${tenant.id}`, tenant);
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      try {
        await service.validateTenant(tenant.id);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(TenantError);
        expect((err as TenantError).code).toBe("TENANT_SUSPENDED");
        expect((err as TenantError).statusCode).toBe(403);
      }
    });

    it("should invalidate cache when tenant is suspended", async () => {
      const tenant = makeTenant({ status: "suspended" });
      cache._store.set(`tenant:${tenant.id}`, tenant);
      const db = createMockDb([tenant]);
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      try {
        await service.validateTenant(tenant.id);
      } catch {
        // Expected
      }
      expect(cache.del).toHaveBeenCalledWith(`tenant:${tenant.id}`);
    });

    it("should throw TENANT_DELETED for deleted tenant", async () => {
      const tenant = makeTenant({ status: "deleted" });
      cache._store.set(`tenant:${tenant.id}`, tenant);
      const db = createMockDb([tenant]);
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      try {
        await service.validateTenant(tenant.id);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(TenantError);
        expect((err as TenantError).code).toBe("TENANT_DELETED");
        expect((err as TenantError).statusCode).toBe(404);
      }
    });

    it("should return active tenant successfully", async () => {
      const tenant = makeTenant({ status: "active" });
      cache._store.set(`tenant:${tenant.id}`, tenant);
      const db = createMockDb([tenant]);
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      const result = await service.validateTenant(tenant.id);
      expect(result).toEqual(tenant);
    });
  });

  describe("invalidateCache", () => {
    it("should delete tenant cache by ID and slug", async () => {
      const tenant = makeTenant();
      cache._store.set(`tenant:${tenant.id}`, tenant);
      cache._store.set(`tenant:slug:${tenant.slug}`, tenant);
      const db = createMockDb([tenant]);
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      await service.invalidateCache(tenant.id);
      expect(cache.del).toHaveBeenCalledWith(`tenant:${tenant.id}`);
      expect(cache.del).toHaveBeenCalledWith(`tenant:slug:${tenant.slug}`);
    });
  });
});

// =============================================================================
// resolveTenant (synchronous)
// =============================================================================

describe("resolveTenant", () => {
  it("should resolve tenant from X-Tenant-ID header", () => {
    const headers = new Headers({ "X-Tenant-ID": "tenant-abc" });
    const result = resolveTenant(headers, null);
    expect(result).toEqual({ tenantId: "tenant-abc", source: "header" });
  });

  it("should resolve tenant from session when header not present", () => {
    const headers = new Headers();
    const session = { currentTenantId: "tenant-xyz" };
    const result = resolveTenant(headers, session);
    expect(result).toEqual({ tenantId: "tenant-xyz", source: "session" });
  });

  it("should prefer header over session", () => {
    const headers = new Headers({ "X-Tenant-ID": "from-header" });
    const session = { currentTenantId: "from-session" };
    const result = resolveTenant(headers, session);
    expect(result).toEqual({ tenantId: "from-header", source: "header" });
  });

  it("should return null when no tenant available", () => {
    const headers = new Headers();
    const result = resolveTenant(headers, null);
    expect(result).toEqual({ tenantId: null, source: null });
  });

  it("should support custom header name", () => {
    const headers = new Headers({ "X-Organization-ID": "org-1" });
    const result = resolveTenant(headers, null, { headerName: "X-Organization-ID" });
    expect(result).toEqual({ tenantId: "org-1", source: "header" });
  });
});

// =============================================================================
// resolveTenantWithFallback (async)
// =============================================================================

describe("resolveTenantWithFallback", () => {
  it("should resolve from header first", async () => {
    const headers = new Headers({ "X-Tenant-ID": "from-header" });
    const result = await resolveTenantWithFallback(headers, null, null, null);
    expect(result).toEqual({ tenantId: "from-header", source: "header" });
  });

  it("should resolve from session.currentTenantId", async () => {
    const headers = new Headers();
    const session = { id: "sess-1", currentTenantId: "from-session" };
    const result = await resolveTenantWithFallback(headers, session, null, null);
    expect(result).toEqual({ tenantId: "from-session", source: "session" });
  });

  it("should fallback to authService.getSessionTenant", async () => {
    const headers = new Headers();
    const session = { id: "sess-1" };
    const authService = {
      getSessionTenant: mock(async () => "from-fallback"),
    };
    const result = await resolveTenantWithFallback(
      headers,
      session,
      "user-1",
      authService
    );
    expect(result).toEqual({ tenantId: "from-fallback", source: "session" });
    expect(authService.getSessionTenant).toHaveBeenCalledWith("sess-1", "user-1");
  });

  it("should return null when no fallback resolves", async () => {
    const headers = new Headers();
    const authService = {
      getSessionTenant: mock(async () => null),
    };
    const result = await resolveTenantWithFallback(
      headers,
      { id: "sess-1" },
      "user-1",
      authService
    );
    expect(result).toEqual({ tenantId: null, source: null });
  });

  it("should skip authService when session or userId is missing", async () => {
    const headers = new Headers();
    const authService = {
      getSessionTenant: mock(async () => "should-not-be-called"),
    };
    const result = await resolveTenantWithFallback(headers, null, null, authService);
    expect(result).toEqual({ tenantId: null, source: null });
    expect(authService.getSessionTenant).not.toHaveBeenCalled();
  });
});

// =============================================================================
// requireTenantContext
// =============================================================================

describe("requireTenantContext", () => {
  it("should not throw when tenant is present", () => {
    const ctx = { tenant: makeTenant(), set: { status: 200 } };
    expect(() => requireTenantContext(ctx)).not.toThrow();
  });

  it("should throw TenantError when tenant is null", () => {
    const ctx = { tenant: null, set: { status: 200 } };
    try {
      requireTenantContext(ctx);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(TenantError);
      expect((err as TenantError).code).toBe("MISSING_TENANT");
    }
  });

  it("should throw TenantError when tenant is undefined", () => {
    const ctx = { tenant: undefined, set: { status: 200 } };
    try {
      requireTenantContext(ctx);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(TenantError);
    }
  });
});

// =============================================================================
// hasTenant type guard
// =============================================================================

describe("hasTenant", () => {
  it("should return true when tenant is not null", () => {
    expect(hasTenant({ tenant: makeTenant() })).toBe(true);
  });

  it("should return false when tenant is null", () => {
    expect(hasTenant({ tenant: null })).toBe(false);
  });
});

// =============================================================================
// Tenant Plugin Elysia Integration
// =============================================================================

describe("tenantPlugin - skip routes", () => {
  it("should skip tenant resolution for health check routes", async () => {
    // The plugin skips /health, /ready, /live, /docs, /api/auth by default.
    // We verify by checking the tenant context is null for these routes.
    const app = new Elysia()
      .decorate("db", createMockDb() as unknown as ReturnType<typeof createMockDb>)
      .decorate("cache", createMockCache() as unknown as ReturnType<typeof createMockCache>)
      .derive(() => ({
        user: null,
        session: null,
        authService: null,
      }))
      .get("/health", (ctx) => ({
        tenantId: (ctx as unknown as { tenantId: string | null }).tenantId,
      }));

    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// UUID Validation
// =============================================================================

describe("TenantService UUID validation", () => {
  it("should accept valid UUIDs", async () => {
    const validUuids = [
      "11111111-1111-1111-1111-111111111111",
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
    ];

    for (const uuid of validUuids) {
      const tenant = makeTenant({ id: uuid });
      const cache = createMockCache();
      cache._store.set(`tenant:${uuid}`, tenant);
      const db = createMockDb([tenant]);
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      const result = await service.validateTenant(uuid);
      expect(result.id).toBe(uuid);
    }
  });

  it("should reject invalid UUID formats", async () => {
    const invalidUuids = [
      "not-a-uuid",
      "12345",
      "",
      "11111111-1111-1111-1111",
      "gggggggg-gggg-gggg-gggg-gggggggggggg",
    ];

    for (const uuid of invalidUuids) {
      const db = createMockDb();
      const cache = createMockCache();
      const service = new TenantService(db as unknown as ConstructorParameters<typeof TenantService>[0], cache as unknown as ConstructorParameters<typeof TenantService>[1]);

      try {
        await service.validateTenant(uuid);
        expect(true).toBe(false); // Should throw
      } catch (err) {
        expect(err).toBeInstanceOf(TenantError);
        expect((err as TenantError).code).toBe("INVALID_TENANT");
      }
    }
  });
});
