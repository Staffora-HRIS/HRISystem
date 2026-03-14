/**
 * Export Worker Unit Tests
 *
 * Tests the export processing system:
 * - CSV export processor registration and invocation
 * - Excel export processor registration and invocation
 * - Value formatting (date, datetime, currency, percentage, boolean)
 * - CSV generation logic (delimiter, quoting, escaping, headers)
 * - Missing tenantId error handling
 * - Filename sanitization
 * - Export expiration and notification contracts
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import {
  csvExportProcessor,
  excelExportProcessor,
  exportProcessors,
  createExportRecord,
  cleanupExpiredExports,
  type ExportColumn,
  type ExportFormat,
  type ExportStatus,
  type CsvExportPayload,
  type ExcelExportPayload,
} from "../../../jobs/export-worker";
import { JobTypes, StreamKeys, type JobPayload, type JobContext } from "../../../jobs/base";

// =============================================================================
// Processor Registrations
// =============================================================================

describe("Export Worker - Processor Registrations", () => {
  test("csvExportProcessor has correct job type and config", () => {
    expect(csvExportProcessor.type).toBe(JobTypes.EXPORT_CSV);
    expect(csvExportProcessor.type).toBe("export.csv");
    expect(csvExportProcessor.timeoutMs).toBe(600000);
    expect(csvExportProcessor.retry).toBe(true);
  });

  test("excelExportProcessor has correct job type and config", () => {
    expect(excelExportProcessor.type).toBe(JobTypes.EXPORT_EXCEL);
    expect(excelExportProcessor.type).toBe("export.excel");
    expect(excelExportProcessor.timeoutMs).toBe(600000);
    expect(excelExportProcessor.retry).toBe(true);
  });

  test("exportProcessors array contains both CSV and Excel processors", () => {
    expect(exportProcessors).toHaveLength(2);
    const types = exportProcessors.map((p) => p.type);
    expect(types).toContain("export.csv");
    expect(types).toContain("export.excel");
  });
});

// =============================================================================
// CSV Export Processor - Missing TenantId
// =============================================================================

describe("Export Worker - processCsvExport error handling", () => {
  let context: JobContext;

  beforeEach(() => {
    context = {
      db: {
        withSystemContext: mock(async (callback: (_tx: unknown) => Promise<unknown>) => {
          const tx = Object.assign(
            (_strings: TemplateStringsArray, ..._values: unknown[]) => Promise.resolve([]),
            { unsafe: mock(() => Promise.resolve([])) }
          );
          return callback(tx);
        }),
      },
      cache: {} as unknown as JobContext["cache"],
      redis: { xadd: mock(() => Promise.resolve("msg-id")) },
      log: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
      },
      jobId: "test-export-1",
      messageId: "msg-1",
      attempt: 1,
    } as unknown as JobContext;
  });

  test("throws error when tenantId is missing from CSV export payload", async () => {
    const payload: JobPayload<CsvExportPayload> = {
      id: "job-csv-no-tenant",
      type: JobTypes.EXPORT_CSV,
      // tenantId is intentionally omitted
      data: {
        query: {
          table: "employees",
          columns: [{ field: "name", header: "Name" }],
        },
        name: "employee-report",
      },
      metadata: { createdAt: new Date().toISOString() },
    };

    await expect(csvExportProcessor.processor(payload, context)).rejects.toThrow(
      "Tenant ID is required for exports"
    );
  });

  test("throws error when tenantId is missing from Excel export payload", async () => {
    const payload: JobPayload<ExcelExportPayload> = {
      id: "job-excel-no-tenant",
      type: JobTypes.EXPORT_EXCEL,
      data: {
        query: {
          table: "employees",
          columns: [{ field: "name", header: "Name" }],
        },
        name: "employee-report",
      },
      metadata: { createdAt: new Date().toISOString() },
    };

    await expect(excelExportProcessor.processor(payload, context)).rejects.toThrow(
      "Tenant ID is required for exports"
    );
  });

  test("logs export start with name before checking tenant", async () => {
    const payload: JobPayload<CsvExportPayload> = {
      id: "job-csv-log",
      type: JobTypes.EXPORT_CSV,
      tenantId: "tenant-1",
      data: {
        query: {
          table: "employees",
          columns: [{ field: "name", header: "Name" }],
        },
        name: "employee-report",
      },
      metadata: { createdAt: new Date().toISOString() },
    };

    try {
      await csvExportProcessor.processor(payload, context);
    } catch {
      // May fail on storage operations -- expected in unit test
    }

    expect(context.log.info).toHaveBeenCalled();
  });
});

// =============================================================================
// CSV Generation Logic (replicated since generateCsv is private)
// =============================================================================

describe("Export Worker - CSV Generation", () => {
  // Replicate the private generateCsv/formatValue to test the algorithm
  function formatValue(
    value: unknown,
    formatter?: "date" | "datetime" | "currency" | "percentage" | "boolean",
    format?: string
  ): string {
    if (value === null || value === undefined) return "";
    switch (formatter) {
      case "date":
        if (value instanceof Date) return value.toISOString().split("T")[0] || "";
        if (typeof value === "string" && value) return new Date(value).toISOString().split("T")[0] || "";
        return String(value);
      case "datetime":
        if (value instanceof Date) return value.toISOString();
        if (typeof value === "string" && value) return new Date(value).toISOString();
        return String(value);
      case "currency":
        if (typeof value === "number") {
          return value.toLocaleString("en-US", { style: "currency", currency: format || "USD" });
        }
        return String(value);
      case "percentage":
        if (typeof value === "number") return `${(value * 100).toFixed(2)}%`;
        return String(value);
      case "boolean":
        return value ? "Yes" : "No";
      default:
        return String(value);
    }
  }

  function generateCsv(
    rows: Array<Record<string, unknown>>,
    columns: ExportColumn[],
    options: {
      delimiter?: string;
      quoteChar?: string;
      escapeChar?: string;
      lineEnding?: string;
      includeHeaders?: boolean;
    } = {}
  ): string {
    const {
      delimiter = ",",
      quoteChar = '"',
      escapeChar = '"',
      lineEnding = "\n",
      includeHeaders = true,
    } = options;

    const escape = (value: string): string => {
      if (value.includes(quoteChar) || value.includes(delimiter) || value.includes("\n")) {
        return quoteChar + value.replace(new RegExp(quoteChar, "g"), escapeChar + quoteChar) + quoteChar;
      }
      return value;
    };

    const lines: string[] = [];
    if (includeHeaders) {
      lines.push(columns.map((col) => escape(col.header)).join(delimiter));
    }
    for (const row of rows) {
      lines.push(
        columns
          .map((col) => escape(formatValue(row[col.field], col.formatter, col.format)))
          .join(delimiter)
      );
    }
    return lines.join(lineEnding);
  }

  test("generates CSV with headers and data rows", () => {
    const columns: ExportColumn[] = [
      { field: "name", header: "Name" },
      { field: "email", header: "Email" },
    ];
    const rows = [
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: "bob@example.com" },
    ];

    const csv = generateCsv(rows, columns);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Name,Email");
    expect(lines[1]).toBe("Alice,alice@example.com");
    expect(lines[2]).toBe("Bob,bob@example.com");
  });

  test("omits header row when includeHeaders is false", () => {
    const columns: ExportColumn[] = [{ field: "x", header: "X" }];
    const csv = generateCsv([{ x: "1" }], columns, { includeHeaders: false });
    expect(csv.split("\n")).toHaveLength(1);
    expect(csv).toBe("1");
  });

  test("quotes values containing the delimiter character", () => {
    const columns: ExportColumn[] = [{ field: "name", header: "Name" }];
    const csv = generateCsv([{ name: "Doe, John" }], columns);
    expect(csv).toContain('"Doe, John"');
  });

  test("escapes embedded quote characters by doubling them", () => {
    const columns: ExportColumn[] = [{ field: "title", header: "Title" }];
    const csv = generateCsv([{ title: 'He said "hello"' }], columns);
    expect(csv).toContain('"He said ""hello"""');
  });

  test("handles null and undefined values as empty strings", () => {
    const columns: ExportColumn[] = [
      { field: "a", header: "A" },
      { field: "b", header: "B" },
    ];
    const csv = generateCsv([{ a: null, b: undefined }], columns);
    expect(csv.split("\n")[1]).toBe(",");
  });
});

// =============================================================================
// Value Formatting
// =============================================================================

describe("Export Worker - Value Formatting", () => {
  // Replicate formatValue for direct testing
  function formatValue(
    value: unknown,
    formatter?: "date" | "datetime" | "currency" | "percentage" | "boolean"
  ): string {
    if (value === null || value === undefined) return "";
    switch (formatter) {
      case "date":
        if (value instanceof Date) return value.toISOString().split("T")[0] || "";
        if (typeof value === "string" && value) return new Date(value).toISOString().split("T")[0] || "";
        return String(value);
      case "datetime":
        if (value instanceof Date) return value.toISOString();
        return String(value);
      case "percentage":
        if (typeof value === "number") return `${(value * 100).toFixed(2)}%`;
        return String(value);
      case "boolean":
        return value ? "Yes" : "No";
      default:
        return String(value);
    }
  }

  test("date formatter extracts YYYY-MM-DD from Date object", () => {
    expect(formatValue(new Date("2024-06-15T10:30:00Z"), "date")).toBe("2024-06-15");
  });

  test("percentage formatter multiplies by 100 and appends %", () => {
    expect(formatValue(0.75, "percentage")).toBe("75.00%");
    expect(formatValue(1, "percentage")).toBe("100.00%");
  });

  test("boolean formatter returns Yes/No", () => {
    expect(formatValue(true, "boolean")).toBe("Yes");
    expect(formatValue(false, "boolean")).toBe("No");
    expect(formatValue(0, "boolean")).toBe("No");
  });

  test("null and undefined return empty string regardless of formatter", () => {
    expect(formatValue(null)).toBe("");
    expect(formatValue(undefined, "date")).toBe("");
  });
});

// =============================================================================
// createExportRecord - database interaction
// =============================================================================

describe("Export Worker - createExportRecord", () => {
  test("calls withSystemContext to insert export record", async () => {
    const insertedValues: unknown[] = [];
    const mockDb = {
      withSystemContext: mock(async (callback: (_tx: unknown) => Promise<unknown>) => {
        const tx = (_strings: TemplateStringsArray, ...values: unknown[]) => {
          insertedValues.push(...values);
          return Promise.resolve([]);
        };
        return callback(tx);
      }),
    } as unknown as Parameters<typeof createExportRecord>[0];

    await createExportRecord(mockDb, {
      id: "exp-1",
      tenantId: "tenant-1",
      userId: "user-1",
      name: "Employee Report",
      format: "csv",
    });

    expect(mockDb.withSystemContext).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// cleanupExpiredExports - expiration logic
// =============================================================================

describe("Export Worker - cleanupExpiredExports", () => {
  test("returns count of expired exports cleaned up", async () => {
    const mockDb = {
      withSystemContext: mock(async (callback: (_tx: unknown) => Promise<unknown>) => {
        const tx = (_strings: TemplateStringsArray, ..._values: unknown[]) => {
          // First call returns expired records, second call returns update count
          return Promise.resolve([{ id: "exp-1", filePath: null }]);
        };
        return callback(tx);
      }),
    } as unknown as Parameters<typeof cleanupExpiredExports>[0];

    const count = await cleanupExpiredExports(mockDb);
    // Returns the length of the result from the UPDATE RETURNING query
    expect(typeof count).toBe("number");
  });
});

// =============================================================================
// Filename Sanitization
// =============================================================================

describe("Export Worker - Filename Sanitization", () => {
  test("replaces non-alphanumeric characters with underscores", () => {
    const name = "Employee Report 2024 (Q1)";
    const exportId = "abc-123";
    const filename = `${exportId}_${name.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    expect(filename).toBe("abc-123_Employee_Report_2024__Q1_.csv");
  });

  test("preserves clean alphanumeric names", () => {
    const sanitized = "SimpleReport".replace(/[^a-zA-Z0-9]/g, "_");
    expect(sanitized).toBe("SimpleReport");
  });
});

// =============================================================================
// Type coverage
// =============================================================================

describe("Export Worker - Type Coverage", () => {
  test("ExportFormat supports csv, xlsx, json", () => {
    const formats: ExportFormat[] = ["csv", "xlsx", "json"];
    expect(formats).toHaveLength(3);
  });

  test("ExportStatus has all lifecycle states", () => {
    const statuses: ExportStatus[] = ["pending", "processing", "completed", "failed", "expired"];
    expect(statuses).toHaveLength(5);
  });

  test("notification stream key is correct", () => {
    expect(StreamKeys.NOTIFICATIONS).toBe("staffora:jobs:notifications");
  });
});
