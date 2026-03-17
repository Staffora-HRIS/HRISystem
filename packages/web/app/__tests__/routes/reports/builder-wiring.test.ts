/**
 * Tests for the Report Builder wiring.
 *
 * Validates that the builder page (new/route.tsx and [reportId]/edit/route.tsx)
 * correctly exports default components, and that the data flow types between
 * builder components are compatible with the API schemas.
 */

import { describe, it, expect } from "vitest";
import type {
  ColumnConfig,
  FilterConfig,
  SortByConfig,
  GroupByConfig,
  ReportConfig,
  FieldCatalogEntry,
  ReportExecutionResult,
  ReportType,
} from "~/routes/(admin)/reports/types";

describe("Report Builder wiring", () => {
  describe("New Report page", () => {
    it("should export a default function component", async () => {
      const mod = await import("~/routes/(admin)/reports/new/route");
      expect(typeof mod.default).toBe("function");
    });
  });

  describe("Edit Report page", () => {
    it("should export a default function component", async () => {
      const mod = await import(
        "~/routes/(admin)/reports/[reportId]/edit/route"
      );
      expect(typeof mod.default).toBe("function");
    });
  });

  describe("Report Detail page", () => {
    it("should export a default function component", async () => {
      const mod = await import("~/routes/(admin)/reports/[reportId]/route");
      expect(typeof mod.default).toBe("function");
    });
  });

  describe("FieldCatalogEntry -> ColumnConfig mapping", () => {
    it("should create a valid ColumnConfig from a FieldCatalogEntry", () => {
      const field: FieldCatalogEntry = {
        fieldKey: "employee.personal.first_name",
        displayName: "First Name",
        description: "Employee first name",
        category: "personal",
        dataType: "string",
        enumValues: null,
        isFilterable: true,
        isSortable: true,
        isGroupable: false,
        isAggregatable: false,
        supportedAggregations: [],
        filterOperators: ["equals", "contains", "starts_with"],
        isPii: true,
        isSensitive: false,
        isCalculated: false,
        displayOrder: 1,
        columnWidth: 150,
        textAlignment: "left",
        isDefaultVisible: true,
      };

      // This is the mapping done in new/route.tsx handleAddField
      const col: ColumnConfig = {
        field_key: field.fieldKey,
        alias: field.displayName,
        width: field.columnWidth,
        visible: true,
        order: 1,
        aggregation: null,
      };

      expect(col.field_key).toBe("employee.personal.first_name");
      expect(col.alias).toBe("First Name");
      expect(col.width).toBe(150);
      expect(col.visible).toBe(true);
      expect(col.aggregation).toBeNull();
    });
  });

  describe("buildConfig output shape", () => {
    it("should produce a valid ReportConfig", () => {
      const columns: ColumnConfig[] = [
        { field_key: "employee.number", alias: "Emp #", order: 1, visible: true, aggregation: null },
        { field_key: "employee.personal.first_name", alias: "First Name", order: 2, visible: true, aggregation: null },
      ];

      const filters: FilterConfig[] = [
        { field_key: "employee.status", operator: "in", value: ["active"] },
      ];

      const sortBy: SortByConfig[] = [
        { field_key: "employee.number", direction: "ASC" },
      ];

      const groupBy: GroupByConfig[] = [];

      // This mirrors the buildConfig function in new/route.tsx
      const config: ReportConfig = {
        columns: columns.map((c, i) => ({ ...c, order: i + 1 })),
        filters: filters.length > 0 ? filters : undefined,
        sortBy: sortBy.length > 0 ? sortBy : undefined,
        groupBy: groupBy.length > 0 ? groupBy : undefined,
        includeTerminated: false,
        distinctEmployees: true,
      };

      expect(config.columns).toHaveLength(2);
      expect(config.columns[0].order).toBe(1);
      expect(config.columns[1].order).toBe(2);
      expect(config.filters).toHaveLength(1);
      expect(config.sortBy).toHaveLength(1);
      expect(config.groupBy).toBeUndefined();
      expect(config.includeTerminated).toBe(false);
      expect(config.distinctEmployees).toBe(true);
    });

    it("should omit empty arrays", () => {
      const config: ReportConfig = {
        columns: [{ field_key: "employee.number", order: 1 }],
        filters: undefined,
        sortBy: undefined,
        groupBy: undefined,
        includeTerminated: false,
        distinctEmployees: true,
      };

      // When serialized to JSON, undefined fields are omitted
      const json = JSON.parse(JSON.stringify(config));
      expect(json.filters).toBeUndefined();
      expect(json.sortBy).toBeUndefined();
      expect(json.groupBy).toBeUndefined();
    });
  });

  describe("API request shape", () => {
    it("should build a valid create report payload", () => {
      const payload = {
        name: "Headcount Report",
        description: "Monthly headcount breakdown",
        report_type: "tabular" as ReportType,
        category: "HR Core",
        config: {
          columns: [
            { field_key: "employee.number", alias: "Emp #", order: 1 },
            { field_key: "employee.personal.first_name", alias: "First Name", order: 2 },
          ],
          filters: [
            { field_key: "employee.status", operator: "equals", value: "active" },
          ],
          includeTerminated: false,
          distinctEmployees: true,
        } as ReportConfig,
        is_public: false,
      };

      expect(payload.name).toBeTruthy();
      expect(payload.config.columns.length).toBeGreaterThan(0);
      expect(payload.config.columns[0].field_key).toBeTruthy();
    });
  });

  describe("ReportExecutionResult shape", () => {
    it("should match the expected API response format", () => {
      const result: ReportExecutionResult = {
        columns: [
          { key: "employee_number", label: "Emp #", dataType: "string" },
          { key: "first_name", label: "First Name", dataType: "string" },
          { key: "salary", label: "Salary", dataType: "currency", alignment: "right" },
        ],
        rows: [
          { employee_number: "EMP001", first_name: "John", salary: 45000 },
          { employee_number: "EMP002", first_name: "Jane", salary: 52000 },
        ],
        totalRows: 2,
        executionMs: 45,
        executionId: "exec-123",
      };

      expect(result.columns).toHaveLength(3);
      expect(result.rows).toHaveLength(2);
      expect(result.totalRows).toBe(2);
      expect(result.executionMs).toBeLessThan(1000);
      expect(result.executionId).toBeTruthy();

      // Verify row data can be accessed by column key
      for (const col of result.columns) {
        for (const row of result.rows) {
          expect(col.key in row).toBe(true);
        }
      }
    });
  });

  describe("ScheduleReportDialog export", () => {
    it("should export ScheduleReportDialog component", async () => {
      const mod = await import(
        "~/routes/(admin)/reports/components/ScheduleReportDialog"
      );
      expect(typeof mod.ScheduleReportDialog).toBe("function");
    });
  });

  describe("Report listing page", () => {
    it("should export a default function component", async () => {
      const mod = await import("~/routes/(admin)/reports/route");
      expect(typeof mod.default).toBe("function");
    });
  });

  describe("Favourites page", () => {
    it("should export a default function component", async () => {
      const mod = await import("~/routes/(admin)/reports/favourites/route");
      expect(typeof mod.default).toBe("function");
    });
  });

  describe("Templates page", () => {
    it("should export a default function component", async () => {
      const mod = await import("~/routes/(admin)/reports/templates/route");
      expect(typeof mod.default).toBe("function");
    });
  });
});
