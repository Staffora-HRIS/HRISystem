/**
 * Tests for the Reports query key factory.
 *
 * Ensures that query keys are correctly scoped and unique,
 * preventing cache collisions in React Query.
 */

import { describe, it, expect } from "vitest";
import { queryKeys } from "~/lib/query-client";

describe("Reports query keys", () => {
  describe("reports.all", () => {
    it("should return a stable key array", () => {
      const key = queryKeys.reports.all();
      expect(key[0]).toBe("reports");
      expect(key).toHaveLength(2); // ["reports", tenantScope]
    });
  });

  describe("reports.list", () => {
    it("should extend the all key", () => {
      const all = queryKeys.reports.all();
      const list = queryKeys.reports.list();
      expect(list.slice(0, 2)).toEqual(all);
      expect(list).toContain("list");
    });
  });

  describe("reports.report", () => {
    it("should include the report ID", () => {
      const key = queryKeys.reports.report("abc-123");
      expect(key).toContain("abc-123");
    });

    it("should produce different keys for different IDs", () => {
      const key1 = queryKeys.reports.report("id-1");
      const key2 = queryKeys.reports.report("id-2");
      expect(key1).not.toEqual(key2);
    });
  });

  describe("reports.execute", () => {
    it("should extend the report key", () => {
      const reportKey = queryKeys.reports.report("r1");
      const execKey = queryKeys.reports.execute("r1");
      expect(execKey.slice(0, reportKey.length)).toEqual(reportKey);
      expect(execKey).toContain("execute");
    });

    it("should include params when provided", () => {
      const key = queryKeys.reports.execute("r1", { page: 1 });
      expect(key[key.length - 1]).toEqual({ page: 1 });
    });
  });

  describe("reports.fieldCatalog", () => {
    it("should extend the all key with 'fields'", () => {
      const key = queryKeys.reports.fieldCatalog();
      expect(key).toContain("fields");
    });
  });

  describe("reports.fieldCategories", () => {
    it("should extend fieldCatalog with 'categories'", () => {
      const key = queryKeys.reports.fieldCategories();
      expect(key).toContain("fields");
      expect(key).toContain("categories");
    });
  });

  describe("reports.fieldValues", () => {
    it("should include the field key", () => {
      const key = queryKeys.reports.fieldValues("employee.status");
      expect(key).toContain("employee.status");
      expect(key).toContain("values");
    });
  });

  describe("reports.templates", () => {
    it("should extend the all key with 'templates'", () => {
      const key = queryKeys.reports.templates();
      expect(key).toContain("templates");
    });
  });

  describe("reports.favourites", () => {
    it("should extend the all key with 'favourites'", () => {
      const key = queryKeys.reports.favourites();
      expect(key).toContain("favourites");
    });
  });

  describe("reports.executions", () => {
    it("should extend the report key with 'executions'", () => {
      const key = queryKeys.reports.executions("r1");
      expect(key).toContain("executions");
    });
  });

  describe("reports.scheduled", () => {
    it("should extend the all key with 'scheduled'", () => {
      const key = queryKeys.reports.scheduled();
      expect(key).toContain("scheduled");
    });
  });

  describe("key uniqueness", () => {
    it("should produce unique keys for different operations", () => {
      const keys = [
        queryKeys.reports.list(),
        queryKeys.reports.fieldCatalog(),
        queryKeys.reports.templates(),
        queryKeys.reports.favourites(),
        queryKeys.reports.scheduled(),
      ];

      const serialized = keys.map((k) => JSON.stringify(k));
      const unique = new Set(serialized);
      expect(unique.size).toBe(keys.length);
    });
  });
});

describe("Analytics query keys", () => {
  describe("analytics.all", () => {
    it("should return a stable key array", () => {
      const key = queryKeys.analytics.all();
      expect(key[0]).toBe("analytics");
      expect(key).toHaveLength(2);
    });
  });

  describe("analytics.diversity", () => {
    it("should extend the all key with diversity", () => {
      const key = queryKeys.analytics.diversity();
      expect(key).toContain("diversity");
    });

    it("should include filters when provided", () => {
      const filters = { org_unit_id: "ou1" };
      const key = queryKeys.analytics.diversity(filters);
      expect(key).toContain("diversity");
      expect(key[key.length - 1]).toEqual(filters);
    });
  });

  describe("analytics.compensation", () => {
    it("should extend the all key with compensation", () => {
      const key = queryKeys.analytics.compensation();
      expect(key).toContain("compensation");
    });

    it("should include filters when provided", () => {
      const filters = { currency: "GBP" };
      const key = queryKeys.analytics.compensation(filters);
      expect(key[key.length - 1]).toEqual(filters);
    });
  });

  describe("analytics.headcount", () => {
    it("should extend the all key with headcount", () => {
      const key = queryKeys.analytics.headcount();
      expect(key).toContain("headcount");
    });
  });

  describe("analytics.turnover", () => {
    it("should extend the all key with turnover", () => {
      const key = queryKeys.analytics.turnover();
      expect(key).toContain("turnover");
    });
  });

  describe("analytics.executive", () => {
    it("should extend the all key with executive", () => {
      const key = queryKeys.analytics.executive();
      expect(key).toContain("executive");
    });
  });

  describe("analytics.manager", () => {
    it("should extend the all key with manager", () => {
      const key = queryKeys.analytics.manager();
      expect(key).toContain("manager");
    });
  });

  describe("key uniqueness", () => {
    it("should produce unique keys for different analytics types", () => {
      const keys = [
        queryKeys.analytics.headcount(),
        queryKeys.analytics.turnover(),
        queryKeys.analytics.diversity(),
        queryKeys.analytics.compensation(),
        queryKeys.analytics.executive(),
        queryKeys.analytics.manager(),
      ];

      const serialized = keys.map((k) => JSON.stringify(k));
      const unique = new Set(serialized);
      expect(unique.size).toBe(keys.length);
    });
  });
});

describe("Directory query keys", () => {
  describe("directory.all", () => {
    it("should return a stable key array", () => {
      const key = queryKeys.directory.all();
      expect(key[0]).toBe("directory");
      expect(key).toHaveLength(2);
    });
  });

  describe("directory.search", () => {
    it("should extend the all key with search", () => {
      const key = queryKeys.directory.search();
      expect(key).toContain("search");
    });

    it("should include filters when provided", () => {
      const filters = { query: "john", department: "Engineering" };
      const key = queryKeys.directory.search(filters);
      expect(key[key.length - 1]).toEqual(filters);
    });
  });

  describe("directory.departments", () => {
    it("should extend the all key with departments", () => {
      const key = queryKeys.directory.departments();
      expect(key).toContain("departments");
    });
  });

  describe("key uniqueness", () => {
    it("should produce unique keys for different directory operations", () => {
      const keys = [
        queryKeys.directory.search(),
        queryKeys.directory.departments(),
      ];

      const serialized = keys.map((k) => JSON.stringify(k));
      const unique = new Set(serialized);
      expect(unique.size).toBe(keys.length);
    });
  });
});
