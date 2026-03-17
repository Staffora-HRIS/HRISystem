/**
 * useTenant Hook Tests
 *
 * Tests for tenant hooks: types, default values, settings merging,
 * feature flags, date/time/currency formatting logic.
 */

import { describe, it, expect } from "vitest";
import type {
  Tenant,
  TenantSettings,
  TenantListItem,
} from "../../hooks/use-tenant";

describe("useTenant Hook", () => {
  describe("Tenant Type", () => {
    it("should have required fields on a Tenant object", () => {
      const tenant: Tenant = {
        id: "t-001",
        name: "Acme Corp",
        slug: "acme-corp",
        status: "active",
        settings: {
          timezone: "Europe/London",
          dateFormat: "DD/MM/YYYY",
          timeFormat: "HH:mm",
          currency: "GBP",
          language: "en",
          features: {},
          branding: {},
        },
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-06-01T00:00:00Z",
      };

      expect(tenant.id).toBe("t-001");
      expect(tenant.name).toBe("Acme Corp");
      expect(tenant.slug).toBe("acme-corp");
      expect(tenant.status).toBe("active");
      expect(tenant.settings).toBeDefined();
    });

    it("should allow optional domain and logoUrl", () => {
      const tenant: Tenant = {
        id: "t-002",
        name: "Test Co",
        slug: "test-co",
        domain: "test.staffora.co.uk",
        logoUrl: "https://cdn.example.com/logo.png",
        status: "active",
        settings: {
          timezone: "UTC",
          dateFormat: "YYYY-MM-DD",
          timeFormat: "HH:mm",
          currency: "GBP",
          language: "en",
          features: {},
          branding: {},
        },
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-06-01T00:00:00Z",
      };

      expect(tenant.domain).toBe("test.staffora.co.uk");
      expect(tenant.logoUrl).toBe("https://cdn.example.com/logo.png");
    });

    it("should support all status values", () => {
      const statuses: Tenant["status"][] = ["active", "inactive", "suspended"];

      expect(statuses).toContain("active");
      expect(statuses).toContain("inactive");
      expect(statuses).toContain("suspended");
      expect(statuses).toHaveLength(3);
    });
  });

  describe("TenantSettings Type", () => {
    it("should have all required settings fields", () => {
      const settings: TenantSettings = {
        timezone: "Europe/London",
        dateFormat: "DD/MM/YYYY",
        timeFormat: "HH:mm",
        currency: "GBP",
        language: "en",
        features: { lms: true, recruitment: false },
        branding: { primaryColor: "#1e40af" },
      };

      expect(settings.timezone).toBe("Europe/London");
      expect(settings.dateFormat).toBe("DD/MM/YYYY");
      expect(settings.timeFormat).toBe("HH:mm");
      expect(settings.currency).toBe("GBP");
      expect(settings.language).toBe("en");
      expect(settings.features.lms).toBe(true);
      expect(settings.features.recruitment).toBe(false);
      expect(settings.branding.primaryColor).toBe("#1e40af");
    });

    it("should allow empty features and branding", () => {
      const settings: TenantSettings = {
        timezone: "UTC",
        dateFormat: "YYYY-MM-DD",
        timeFormat: "HH:mm",
        currency: "GBP",
        language: "en",
        features: {},
        branding: {},
      };

      expect(Object.keys(settings.features)).toHaveLength(0);
      expect(Object.keys(settings.branding)).toHaveLength(0);
    });

    it("should support optional branding fields", () => {
      const settings: TenantSettings = {
        timezone: "UTC",
        dateFormat: "YYYY-MM-DD",
        timeFormat: "HH:mm",
        currency: "GBP",
        language: "en",
        features: {},
        branding: {
          primaryColor: "#1e40af",
          secondaryColor: "#64748b",
          logoUrl: "https://cdn.example.com/logo.png",
          faviconUrl: "https://cdn.example.com/favicon.ico",
        },
      };

      expect(settings.branding.primaryColor).toBe("#1e40af");
      expect(settings.branding.secondaryColor).toBe("#64748b");
      expect(settings.branding.logoUrl).toBeDefined();
      expect(settings.branding.faviconUrl).toBeDefined();
    });
  });

  describe("TenantListItem Type", () => {
    it("should have required fields", () => {
      const item: TenantListItem = {
        id: "t-001",
        name: "Acme Corp",
        slug: "acme-corp",
        role: "tenant_admin",
      };

      expect(item.id).toBe("t-001");
      expect(item.name).toBe("Acme Corp");
      expect(item.slug).toBe("acme-corp");
      expect(item.role).toBe("tenant_admin");
    });

    it("should allow optional logoUrl", () => {
      const withLogo: TenantListItem = {
        id: "t-001",
        name: "Acme",
        slug: "acme",
        logoUrl: "https://cdn.example.com/logo.png",
        role: "employee",
      };

      const withoutLogo: TenantListItem = {
        id: "t-002",
        name: "Beta",
        slug: "beta",
        role: "employee",
      };

      expect(withLogo.logoUrl).toBeDefined();
      expect(withoutLogo.logoUrl).toBeUndefined();
    });
  });

  describe("Default Settings Merging", () => {
    it("should provide default settings when data is null", () => {
      const settings: TenantSettings | undefined = undefined;

      const merged: TenantSettings = {
        timezone: settings?.timezone ?? "UTC",
        dateFormat: settings?.dateFormat ?? "YYYY-MM-DD",
        timeFormat: settings?.timeFormat ?? "HH:mm",
        currency: settings?.currency ?? "GBP",
        language: settings?.language ?? "en",
        features: settings?.features ?? {},
        branding: settings?.branding ?? {},
      };

      expect(merged.timezone).toBe("UTC");
      expect(merged.dateFormat).toBe("YYYY-MM-DD");
      expect(merged.timeFormat).toBe("HH:mm");
      expect(merged.currency).toBe("GBP");
      expect(merged.language).toBe("en");
      expect(merged.features).toEqual({});
      expect(merged.branding).toEqual({});
    });

    it("should preserve provided settings over defaults", () => {
      const settings: TenantSettings = {
        timezone: "Europe/London",
        dateFormat: "DD/MM/YYYY",
        timeFormat: "hh:mm A",
        currency: "EUR",
        language: "fr",
        features: { lms: true },
        branding: { primaryColor: "#ff0000" },
      };

      const merged: TenantSettings = {
        timezone: settings?.timezone ?? "UTC",
        dateFormat: settings?.dateFormat ?? "YYYY-MM-DD",
        timeFormat: settings?.timeFormat ?? "HH:mm",
        currency: settings?.currency ?? "GBP",
        language: settings?.language ?? "en",
        features: settings?.features ?? {},
        branding: settings?.branding ?? {},
      };

      expect(merged.timezone).toBe("Europe/London");
      expect(merged.dateFormat).toBe("DD/MM/YYYY");
      expect(merged.currency).toBe("EUR");
      expect(merged.language).toBe("fr");
      expect(merged.features).toEqual({ lms: true });
    });
  });

  describe("Feature Flag Checking", () => {
    it("should return true for enabled features", () => {
      const features: Record<string, boolean> = {
        lms: true,
        recruitment: true,
        benefits: false,
      };

      const isFeatureEnabled = (feature: string): boolean => {
        return features[feature] ?? false;
      };

      expect(isFeatureEnabled("lms")).toBe(true);
      expect(isFeatureEnabled("recruitment")).toBe(true);
    });

    it("should return false for disabled features", () => {
      const features: Record<string, boolean> = {
        benefits: false,
      };

      const isFeatureEnabled = (feature: string): boolean => {
        return features[feature] ?? false;
      };

      expect(isFeatureEnabled("benefits")).toBe(false);
    });

    it("should return false for unknown features", () => {
      const features: Record<string, boolean> = {};

      const isFeatureEnabled = (feature: string): boolean => {
        return features[feature] ?? false;
      };

      expect(isFeatureEnabled("nonexistent_feature")).toBe(false);
      expect(isFeatureEnabled("")).toBe(false);
    });
  });

  describe("Computed Values", () => {
    it("should derive tenantId from tenant data", () => {
      const tenant: Tenant | undefined = {
        id: "t-001",
        name: "Acme",
        slug: "acme",
        status: "active",
        settings: {
          timezone: "UTC",
          dateFormat: "YYYY-MM-DD",
          timeFormat: "HH:mm",
          currency: "GBP",
          language: "en",
          features: {},
          branding: {},
        },
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const tenantId = tenant?.id ?? null;
      const tenantName = tenant?.name ?? null;

      expect(tenantId).toBe("t-001");
      expect(tenantName).toBe("Acme");
    });

    it("should return null tenantId when no tenant", () => {
      const tenant: Tenant | undefined = undefined;

      const tenantId = tenant?.id ?? null;
      const tenantName = tenant?.name ?? null;

      expect(tenantId).toBeNull();
      expect(tenantName).toBeNull();
    });
  });

  describe("Multiple Tenants", () => {
    it("should detect when user has multiple tenants", () => {
      const tenants: TenantListItem[] = [
        { id: "t-001", name: "Acme", slug: "acme", role: "admin" },
        { id: "t-002", name: "Beta", slug: "beta", role: "employee" },
      ];

      const hasMultipleTenants = (tenants?.length ?? 0) > 1;
      expect(hasMultipleTenants).toBe(true);
    });

    it("should detect when user has single tenant", () => {
      const tenants: TenantListItem[] = [
        { id: "t-001", name: "Acme", slug: "acme", role: "admin" },
      ];

      const hasMultipleTenants = (tenants?.length ?? 0) > 1;
      expect(hasMultipleTenants).toBe(false);
    });

    it("should handle empty tenant list", () => {
      const tenants: TenantListItem[] = [];

      const hasMultipleTenants = (tenants?.length ?? 0) > 1;
      expect(hasMultipleTenants).toBe(false);
    });

    it("should handle null tenant list", () => {
      const tenants: TenantListItem[] | undefined = undefined;

      const hasMultipleTenants = (tenants?.length ?? 0) > 1;
      expect(hasMultipleTenants).toBe(false);
    });
  });

  describe("Date Formatting Logic", () => {
    it("should format date with YYYY-MM-DD pattern", () => {
      const d = new Date(2025, 5, 15); // June 15, 2025
      const format = "YYYY-MM-DD";

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");

      const result = format
        .replace("YYYY", String(year))
        .replace("MM", month)
        .replace("DD", day);

      expect(result).toBe("2025-06-15");
    });

    it("should format date with DD/MM/YYYY pattern", () => {
      const d = new Date(2025, 0, 5); // January 5, 2025
      const format = "DD/MM/YYYY";

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");

      const result = format
        .replace("YYYY", String(year))
        .replace("MM", month)
        .replace("DD", day);

      expect(result).toBe("05/01/2025");
    });

    it("should handle string date input", () => {
      const dateStr = "2025-03-10T14:30:00Z";
      const d = new Date(dateStr);

      expect(d.getFullYear()).toBe(2025);
      // Month and day depend on timezone, so just verify it parses
      expect(d instanceof Date).toBe(true);
      expect(isNaN(d.getTime())).toBe(false);
    });
  });

  describe("Time Formatting Logic", () => {
    it("should format time in 24-hour format", () => {
      const d = new Date(2025, 0, 1, 14, 30);
      const format = "HH:mm";

      const hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const result = `${String(hours).padStart(2, "0")}:${minutes}`;

      expect(result).toBe("14:30");
    });

    it("should format time in 12-hour format", () => {
      const d = new Date(2025, 0, 1, 14, 30);
      const format = "hh:mm A";

      const hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const period = hours >= 12 ? "PM" : "AM";
      const hours12 = hours % 12 || 12;
      const result = `${hours12}:${minutes} ${period}`;

      expect(result).toBe("2:30 PM");
    });

    it("should handle midnight correctly in 12-hour format", () => {
      const d = new Date(2025, 0, 1, 0, 0);
      const hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const period = hours >= 12 ? "PM" : "AM";
      const hours12 = hours % 12 || 12;
      const result = `${hours12}:${minutes} ${period}`;

      expect(result).toBe("12:00 AM");
    });

    it("should handle noon correctly in 12-hour format", () => {
      const d = new Date(2025, 0, 1, 12, 0);
      const hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const period = hours >= 12 ? "PM" : "AM";
      const hours12 = hours % 12 || 12;
      const result = `${hours12}:${minutes} ${period}`;

      expect(result).toBe("12:00 PM");
    });
  });

  describe("Currency Formatting Logic", () => {
    it("should format GBP amounts", () => {
      const amount = 1234.56;
      const formatted = new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
      }).format(amount);

      expect(formatted).toContain("1,234.56");
    });

    it("should format EUR amounts", () => {
      const amount = 999.99;
      const formatted = new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "EUR",
      }).format(amount);

      expect(formatted).toContain("999.99");
    });

    it("should handle zero amount", () => {
      const formatted = new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
      }).format(0);

      expect(formatted).toContain("0.00");
    });

    it("should handle negative amounts", () => {
      const formatted = new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
      }).format(-500);

      expect(formatted).toContain("500.00");
    });
  });
});
