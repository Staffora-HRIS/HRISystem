/**
 * Tests for the Reports module shared types and constants.
 */

import { describe, it, expect } from "vitest";
import {
  FILTER_OPERATORS,
  AGGREGATION_LABELS,
  CATEGORY_LABELS,
} from "~/routes/(admin)/reports/types";
import type {
  ColumnConfig,
  FilterConfig,
  ReportConfig,
  ReportType,
} from "~/routes/(admin)/reports/types";

describe("Reports types", () => {
  describe("FILTER_OPERATORS", () => {
    it("should define common operators", () => {
      expect(FILTER_OPERATORS.equals).toBeDefined();
      expect(FILTER_OPERATORS.not_equals).toBeDefined();
      expect(FILTER_OPERATORS.contains).toBeDefined();
      expect(FILTER_OPERATORS.is_null).toBeDefined();
      expect(FILTER_OPERATORS.is_not_null).toBeDefined();
      expect(FILTER_OPERATORS.between).toBeDefined();
      expect(FILTER_OPERATORS.in).toBeDefined();
    });

    it("should have label and types array for each operator", () => {
      for (const [, op] of Object.entries(FILTER_OPERATORS)) {
        expect(op.label).toBeTruthy();
        expect(Array.isArray(op.types)).toBe(true);
        expect(op.types.length).toBeGreaterThan(0);
      }
    });

    it("should include string type for text operators", () => {
      expect(FILTER_OPERATORS.contains.types).toContain("string");
      expect(FILTER_OPERATORS.starts_with.types).toContain("string");
    });

    it("should include date type for range operators", () => {
      expect(FILTER_OPERATORS.between.types).toContain("date");
      expect(FILTER_OPERATORS.gt.types).toContain("date");
      expect(FILTER_OPERATORS.lt.types).toContain("date");
    });

    it("should include numeric types for comparison operators", () => {
      expect(FILTER_OPERATORS.gte.types).toContain("integer");
      expect(FILTER_OPERATORS.gte.types).toContain("decimal");
      expect(FILTER_OPERATORS.lte.types).toContain("currency");
    });

    it("should include enum type for in/not_in operators", () => {
      expect(FILTER_OPERATORS.in.types).toContain("enum");
      expect(FILTER_OPERATORS.not_in.types).toContain("enum");
    });
  });

  describe("AGGREGATION_LABELS", () => {
    it("should define all standard aggregations", () => {
      expect(AGGREGATION_LABELS.count).toBe("Count");
      expect(AGGREGATION_LABELS.count_distinct).toBe("Count Distinct");
      expect(AGGREGATION_LABELS.sum).toBe("Sum");
      expect(AGGREGATION_LABELS.avg).toBe("Average");
      expect(AGGREGATION_LABELS.min).toBe("Minimum");
      expect(AGGREGATION_LABELS.max).toBe("Maximum");
    });
  });

  describe("CATEGORY_LABELS", () => {
    it("should define labels for all major categories", () => {
      expect(CATEGORY_LABELS.personal).toBe("Personal");
      expect(CATEGORY_LABELS.employment).toBe("Employment");
      expect(CATEGORY_LABELS.compensation).toBe("Compensation");
      expect(CATEGORY_LABELS.compliance).toBe("Compliance");
      expect(CATEGORY_LABELS.documents).toBe("Documents");
    });

    it("should not have any empty labels", () => {
      for (const [, label] of Object.entries(CATEGORY_LABELS)) {
        expect(label).toBeTruthy();
        expect(typeof label).toBe("string");
      }
    });
  });

  describe("Type shapes", () => {
    it("should allow valid ColumnConfig", () => {
      const col: ColumnConfig = {
        field_key: "employee.number",
        alias: "Emp #",
        visible: true,
        order: 1,
        aggregation: "count",
      };
      expect(col.field_key).toBe("employee.number");
      expect(col.aggregation).toBe("count");
    });

    it("should allow null aggregation", () => {
      const col: ColumnConfig = {
        field_key: "employee.name",
        aggregation: null,
      };
      expect(col.aggregation).toBeNull();
    });

    it("should allow valid FilterConfig", () => {
      const filter: FilterConfig = {
        field_key: "employee.status",
        operator: "in",
        value: ["active", "on_leave"],
      };
      expect(filter.operator).toBe("in");
      expect(Array.isArray(filter.value)).toBe(true);
    });

    it("should allow parameter filters", () => {
      const filter: FilterConfig = {
        field_key: "employee.hire_date",
        operator: "gte",
        value: null,
        is_parameter: true,
        parameter_label: "Hired after",
      };
      expect(filter.is_parameter).toBe(true);
      expect(filter.parameter_label).toBe("Hired after");
    });

    it("should allow valid ReportConfig", () => {
      const config: ReportConfig = {
        columns: [
          { field_key: "employee.number", order: 1 },
          { field_key: "employee.personal.first_name", order: 2 },
        ],
        filters: [
          { field_key: "employee.status", operator: "in", value: ["active"] },
        ],
        sortBy: [{ field_key: "employee.personal.last_name", direction: "ASC" }],
        includeTerminated: false,
        distinctEmployees: true,
      };
      expect(config.columns).toHaveLength(2);
      expect(config.filters).toHaveLength(1);
    });

    it("should allow all valid ReportType values", () => {
      const types: ReportType[] = [
        "tabular",
        "summary",
        "cross_tab",
        "chart",
        "dashboard_widget",
        "headcount",
        "turnover",
        "compliance",
      ];
      expect(types).toHaveLength(8);
      types.forEach((t) => expect(typeof t).toBe("string"));
    });
  });
});
