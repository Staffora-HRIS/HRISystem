/**
 * useTenant Hook Tests
 *
 * Tests for tenant hooks: useTenant, useTenantSettings, useUserTenants,
 * useSwitchTenant, TenantFeatureGate, useFormatDate, useFormatTime,
 * useFormatCurrency.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock api-client
vi.mock("../../lib/api-client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    setTenantId: vi.fn(),
    getTenantId: vi.fn(() => "test-tenant"),
  },
}));

// Mock auth
vi.mock("../../lib/auth", () => ({
  useSession: vi.fn(() => ({
    isAuthenticated: true,
    user: { id: "user-1" },
    session: { id: "session-1" },
    isLoading: false,
    error: null,
  })),
}));

// Mock better-auth
vi.mock("../../lib/better-auth", () => ({
  authClient: {},
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signOutUser: vi.fn(),
  getCurrentSession: vi.fn(),
  twoFactor: { enable: vi.fn(), verifyTotp: vi.fn(), disable: vi.fn() },
}));

// Mock query-client
vi.mock("../../lib/query-client", () => ({
  queryKeys: {
    _tenantScope: () => "test-tenant",
    auth: {
      all: () => ["auth"],
      session: () => ["auth", "session", "test-tenant"],
      permissions: () => ["auth", "permissions", "test-tenant"],
      me: () => ["auth", "me", "test-tenant"],
      mfaStatus: () => ["auth", "mfa-status", "test-tenant"],
    },
    tenant: {
      all: () => ["tenant"],
      current: () => ["tenant", "current", "test-tenant"],
      settings: () => ["tenant", "settings", "test-tenant"],
      list: () => ["tenant", "list", "test-tenant"],
    },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns tenant data when authenticated", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tenant-1",
      name: "Acme Corp",
      slug: "acme",
      status: "active",
      settings: { timezone: "UTC", currency: "GBP" },
    });

    const { useTenant } = await import("../../hooks/use-tenant");
    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.tenant?.id).toBe("tenant-1");
    expect(result.current.tenant?.name).toBe("Acme Corp");
    expect(result.current.tenantId).toBe("tenant-1");
    expect(result.current.tenantName).toBe("Acme Corp");
  });

  it("returns null tenant values when no data", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Not found"));

    const { useTenant } = await import("../../hooks/use-tenant");
    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.tenantId).toBeNull();
    expect(result.current.tenantName).toBeNull();
  });
});

describe("useTenantSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns merged settings with defaults", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      timezone: "Europe/London",
      dateFormat: "DD/MM/YYYY",
      timeFormat: "HH:mm",
      currency: "GBP",
      language: "en",
      features: { lms: true, benefits: false },
      branding: { primaryColor: "#007bff" },
    });

    const { useTenantSettings } = await import("../../hooks/use-tenant");
    const { result } = renderHook(() => useTenantSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.settings.timezone).toBe("Europe/London");
    expect(result.current.settings.currency).toBe("GBP");
    expect(result.current.settings.features.lms).toBe(true);
  });

  it("provides defaults when API returns nothing", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Err"));

    const { useTenantSettings } = await import("../../hooks/use-tenant");
    const { result } = renderHook(() => useTenantSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Defaults should be applied
    expect(result.current.settings.timezone).toBe("UTC");
    expect(result.current.settings.currency).toBe("GBP");
    expect(result.current.settings.language).toBe("en");
  });

  it("isFeatureEnabled checks feature flags", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      timezone: "UTC",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "HH:mm",
      currency: "GBP",
      language: "en",
      features: { lms: true, recruitment: false },
      branding: {},
    });

    const { useTenantSettings } = await import("../../hooks/use-tenant");
    const { result } = renderHook(() => useTenantSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isFeatureEnabled("lms")).toBe(true);
    expect(result.current.isFeatureEnabled("recruitment")).toBe(false);
    expect(result.current.isFeatureEnabled("nonexistent")).toBe(false);
  });
});

describe("useUserTenants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns list of tenants and multiple-tenant flag", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "t-1", name: "Acme", slug: "acme", role: "admin" },
      { id: "t-2", name: "Beta", slug: "beta", role: "user" },
    ]);

    const { useUserTenants } = await import("../../hooks/use-tenant");
    const { result } = renderHook(() => useUserTenants(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.tenants).toHaveLength(2);
    expect(result.current.hasMutipleTenants).toBe(true);
  });

  it("returns false for hasMutipleTenants with single tenant", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "t-1", name: "Acme", slug: "acme", role: "admin" },
    ]);

    const { useUserTenants } = await import("../../hooks/use-tenant");
    const { result } = renderHook(() => useUserTenants(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.tenants).toHaveLength(1);
    expect(result.current.hasMutipleTenants).toBe(false);
  });

  it("returns empty array when fetch fails", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Unauthorized"));

    const { useUserTenants } = await import("../../hooks/use-tenant");
    const { result } = renderHook(() => useUserTenants(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.tenants).toEqual([]);
    expect(result.current.hasMutipleTenants).toBe(false);
  });
});

describe("useFormatDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats date according to tenant dateFormat", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      timezone: "UTC",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "HH:mm",
      currency: "GBP",
      language: "en",
      features: {},
      branding: {},
    });

    const { useFormatDate } = await import("../../hooks/use-tenant");
    const { result } = renderHook(() => useFormatDate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      // Give time for query to resolve
      expect(result.current).toBeDefined();
    });

    // Test with a specific date
    const formatted = result.current(new Date(2024, 0, 15));
    expect(formatted).toBe("2024-01-15");
  });

  it("formats date string input", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      timezone: "UTC",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "HH:mm",
      currency: "GBP",
      language: "en",
      features: {},
      branding: {},
    });

    const { useFormatDate } = await import("../../hooks/use-tenant");
    const { result } = renderHook(() => useFormatDate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBeDefined();
    });

    // Pass string date
    const formatted = result.current("2024-06-15T00:00:00Z");
    expect(formatted).toContain("2024");
  });
});

describe("useFormatTime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats time in 24-hour format", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      timezone: "UTC",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "HH:mm",
      currency: "GBP",
      language: "en",
      features: {},
      branding: {},
    });

    const { useFormatTime } = await import("../../hooks/use-tenant");
    const { result } = renderHook(() => useFormatTime(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBeDefined();
    });

    const formatted = result.current(new Date(2024, 0, 1, 14, 30));
    expect(formatted).toBe("14:30");
  });

  it("formats time in 12-hour format", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      timezone: "UTC",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "hh:mm A",
      currency: "GBP",
      language: "en",
      features: {},
      branding: {},
    });

    const { useFormatTime } = await import("../../hooks/use-tenant");
    const { result } = renderHook(() => useFormatTime(), {
      wrapper: createWrapper(),
    });

    // Wait until the formatter returns 12-hour format (settings query must resolve first)
    await waitFor(() => {
      const formatted = result.current(new Date(2024, 0, 1, 14, 30));
      expect(formatted).toBe("2:30 PM");
    });
  });
});

describe("useFormatCurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats currency according to tenant settings", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      timezone: "UTC",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "HH:mm",
      currency: "GBP",
      language: "en",
      features: {},
      branding: {},
    });

    const { useFormatCurrency } = await import("../../hooks/use-tenant");
    const { result } = renderHook(() => useFormatCurrency(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toBeDefined();
    });

    const formatted = result.current(1234.56);
    expect(formatted).toContain("1,234.56");
  });
});
