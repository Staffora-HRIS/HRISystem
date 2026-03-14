/**
 * TypeBox Schemas Tests
 *
 * Tests that schemas are defined correctly with expected properties and constraints.
 * Note: Value.Check for schemas using `format` (uuid, email, date, date-time, uri)
 * requires format registration which is done at the application level, not in the
 * shared package. These tests verify schema structure and use Value.Check only for
 * schemas with basic type/literal/pattern validation.
 */

import { describe, test, expect } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
  UUIDSchema,
  DateSchema,
  TimestampSchema,
  EmailSchema,
  UrlSchema,
  PaginationSchema,
  CursorPaginationSchema,
  PaginationMetaSchema,
  SortDirectionSchema,
  SortSchema,
  ApiErrorSchema,
  DateRangeSchema,
  BaseEntitySchema,
  TenantScopedEntitySchema,
  MoneySchema,
  EmployeeStatusSchema,
  LoginRequestSchema,
  MfaVerifyRequestSchema,
  IdParamSchema,
  SearchQuerySchema,
  DateFilterSchema,
  BulkIdsSchema,
  BulkResultSchema,
  FileMetadataSchema,
  createPaginatedResponseSchema,
  createSingleResponseSchema,
} from "../../schemas/index";
import { Type } from "@sinclair/typebox";

describe("TypeBox Schemas", () => {
  // ---------------------------------------------------------------------------
  // Base Schemas - Structural Tests
  // ---------------------------------------------------------------------------
  describe("UUIDSchema", () => {
    test("schema is defined with format uuid", () => {
      expect(UUIDSchema).toBeDefined();
      expect(UUIDSchema.format).toBe("uuid");
      expect(UUIDSchema.type).toBe("string");
    });

    test("has description", () => {
      expect(UUIDSchema.description).toBeDefined();
    });
  });

  describe("DateSchema", () => {
    test("schema is defined with format date", () => {
      expect(DateSchema).toBeDefined();
      expect(DateSchema.format).toBe("date");
      expect(DateSchema.type).toBe("string");
    });

    test("has YYYY-MM-DD pattern", () => {
      expect(DateSchema.pattern).toBeDefined();
    });
  });

  describe("TimestampSchema", () => {
    test("schema is defined with format date-time", () => {
      expect(TimestampSchema).toBeDefined();
      expect(TimestampSchema.format).toBe("date-time");
      expect(TimestampSchema.type).toBe("string");
    });
  });

  describe("EmailSchema", () => {
    test("schema is defined with format email", () => {
      expect(EmailSchema).toBeDefined();
      expect(EmailSchema.format).toBe("email");
      expect(EmailSchema.maxLength).toBe(255);
    });
  });

  describe("UrlSchema", () => {
    test("schema is defined with format uri", () => {
      expect(UrlSchema).toBeDefined();
      expect(UrlSchema.format).toBe("uri");
    });
  });

  // ---------------------------------------------------------------------------
  // Pagination Schemas
  // ---------------------------------------------------------------------------
  describe("PaginationSchema", () => {
    test("schema is defined as object with page and pageSize", () => {
      expect(PaginationSchema).toBeDefined();
      expect(PaginationSchema.type).toBe("object");
      expect(PaginationSchema.properties.page).toBeDefined();
      expect(PaginationSchema.properties.pageSize).toBeDefined();
    });

    test("page and pageSize are optional (empty object passes)", () => {
      const valid = Value.Check(PaginationSchema, {});
      expect(valid).toBe(true);
    });

    test("accepts valid pagination", () => {
      const valid = Value.Check(PaginationSchema, { page: 1, pageSize: 20 });
      expect(valid).toBe(true);
    });

    test("rejects negative page", () => {
      const valid = Value.Check(PaginationSchema, { page: 0 });
      expect(valid).toBe(false);
    });

    test("rejects pageSize over 100", () => {
      const valid = Value.Check(PaginationSchema, { pageSize: 101 });
      expect(valid).toBe(false);
    });

    test("rejects non-integer page", () => {
      const valid = Value.Check(PaginationSchema, { page: 1.5 });
      expect(valid).toBe(false);
    });
  });

  describe("CursorPaginationSchema", () => {
    test("schema is defined as object", () => {
      expect(CursorPaginationSchema).toBeDefined();
      expect(CursorPaginationSchema.type).toBe("object");
    });

    test("accepts empty object (all optional)", () => {
      expect(Value.Check(CursorPaginationSchema, {})).toBe(true);
    });

    test("accepts valid limit", () => {
      expect(Value.Check(CursorPaginationSchema, { limit: 50 })).toBe(true);
    });

    test("rejects invalid direction", () => {
      const valid = Value.Check(CursorPaginationSchema, {
        direction: "sideways",
      });
      expect(valid).toBe(false);
    });

    test("accepts forward direction", () => {
      const valid = Value.Check(CursorPaginationSchema, {
        direction: "forward",
      });
      expect(valid).toBe(true);
    });

    test("accepts backward direction", () => {
      const valid = Value.Check(CursorPaginationSchema, {
        direction: "backward",
      });
      expect(valid).toBe(true);
    });
  });

  describe("PaginationMetaSchema", () => {
    test("schema is defined with required fields", () => {
      expect(PaginationMetaSchema).toBeDefined();
      expect(PaginationMetaSchema.properties.page).toBeDefined();
      expect(PaginationMetaSchema.properties.pageSize).toBeDefined();
      expect(PaginationMetaSchema.properties.totalItems).toBeDefined();
      expect(PaginationMetaSchema.properties.totalPages).toBeDefined();
      expect(PaginationMetaSchema.properties.hasNextPage).toBeDefined();
      expect(PaginationMetaSchema.properties.hasPreviousPage).toBeDefined();
    });

    test("validates valid pagination meta", () => {
      const valid = Value.Check(PaginationMetaSchema, {
        page: 1,
        pageSize: 20,
        totalItems: 100,
        totalPages: 5,
        hasNextPage: true,
        hasPreviousPage: false,
      });
      expect(valid).toBe(true);
    });

    test("rejects missing required fields", () => {
      const valid = Value.Check(PaginationMetaSchema, {
        page: 1,
      });
      expect(valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Sort Schemas
  // ---------------------------------------------------------------------------
  describe("SortDirectionSchema", () => {
    test("accepts asc", () => {
      expect(Value.Check(SortDirectionSchema, "asc")).toBe(true);
    });

    test("accepts desc", () => {
      expect(Value.Check(SortDirectionSchema, "desc")).toBe(true);
    });

    test("rejects invalid values", () => {
      expect(Value.Check(SortDirectionSchema, "ascending")).toBe(false);
      expect(Value.Check(SortDirectionSchema, "")).toBe(false);
      expect(Value.Check(SortDirectionSchema, "ASC")).toBe(false);
    });
  });

  describe("SortSchema", () => {
    test("accepts valid sort params", () => {
      const valid = Value.Check(SortSchema, {
        sortBy: "createdAt",
        sortDirection: "desc",
      });
      expect(valid).toBe(true);
    });

    test("accepts empty object (both optional)", () => {
      expect(Value.Check(SortSchema, {})).toBe(true);
    });

    test("rejects invalid sort direction", () => {
      expect(Value.Check(SortSchema, { sortDirection: "upward" })).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // API Response Schemas
  // ---------------------------------------------------------------------------
  describe("ApiErrorSchema", () => {
    test("schema is defined with success and error properties", () => {
      expect(ApiErrorSchema).toBeDefined();
      expect(ApiErrorSchema.properties.success).toBeDefined();
      expect(ApiErrorSchema.properties.error).toBeDefined();
    });

    test("error object has code and message properties", () => {
      const errorSchema = ApiErrorSchema.properties.error;
      expect(errorSchema.properties.code).toBeDefined();
      expect(errorSchema.properties.message).toBeDefined();
    });

    test("validates valid error response", () => {
      const valid = Value.Check(ApiErrorSchema, {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Resource not found",
        },
      });
      expect(valid).toBe(true);
    });

    test("validates error with optional details", () => {
      const valid = Value.Check(ApiErrorSchema, {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: { field: "name" },
          fieldErrors: { name: ["Required"] },
          requestId: "req-123",
        },
      });
      expect(valid).toBe(true);
    });

    test("rejects success: true", () => {
      const valid = Value.Check(ApiErrorSchema, {
        success: true,
        error: {
          code: "NOT_FOUND",
          message: "Not found",
        },
      });
      expect(valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Date Range Schema - Structural Tests
  // ---------------------------------------------------------------------------
  describe("DateRangeSchema", () => {
    test("schema has effectiveFrom and effectiveTo properties", () => {
      expect(DateRangeSchema).toBeDefined();
      expect(DateRangeSchema.properties.effectiveFrom).toBeDefined();
      expect(DateRangeSchema.properties.effectiveTo).toBeDefined();
    });

    test("effectiveTo allows null via Union type", () => {
      // The effectiveTo schema is a Union of DateSchema and Null
      const effectiveToSchema = DateRangeSchema.properties.effectiveTo;
      expect(effectiveToSchema.anyOf).toBeDefined();
      // Should contain a null type option
      const hasNullType = effectiveToSchema.anyOf.some(
        (s: { type: string }) => s.type === "null"
      );
      expect(hasNullType).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Entity Schemas
  // ---------------------------------------------------------------------------
  describe("BaseEntitySchema", () => {
    test("has id, createdAt, updatedAt", () => {
      expect(BaseEntitySchema.properties.id).toBeDefined();
      expect(BaseEntitySchema.properties.createdAt).toBeDefined();
      expect(BaseEntitySchema.properties.updatedAt).toBeDefined();
    });

    test("all fields are string type", () => {
      expect(BaseEntitySchema.properties.id.type).toBe("string");
      expect(BaseEntitySchema.properties.createdAt.type).toBe("string");
      expect(BaseEntitySchema.properties.updatedAt.type).toBe("string");
    });
  });

  describe("TenantScopedEntitySchema", () => {
    test("has tenantId in addition to base fields", () => {
      expect(TenantScopedEntitySchema.properties.id).toBeDefined();
      expect(TenantScopedEntitySchema.properties.tenantId).toBeDefined();
      expect(TenantScopedEntitySchema.properties.createdAt).toBeDefined();
      expect(TenantScopedEntitySchema.properties.updatedAt).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Money Schema
  // ---------------------------------------------------------------------------
  describe("MoneySchema", () => {
    test("validates valid money object", () => {
      const valid = Value.Check(MoneySchema, {
        amount: 1000,
        currency: "GBP",
      });
      expect(valid).toBe(true);
    });

    test("rejects invalid currency format (too long)", () => {
      const valid = Value.Check(MoneySchema, {
        amount: 1000,
        currency: "pounds",
      });
      expect(valid).toBe(false);
    });

    test("currency must be 3 uppercase letters", () => {
      expect(Value.Check(MoneySchema, { amount: 100, currency: "USD" })).toBe(true);
      expect(Value.Check(MoneySchema, { amount: 100, currency: "usd" })).toBe(false);
      expect(Value.Check(MoneySchema, { amount: 100, currency: "US" })).toBe(false);
      expect(Value.Check(MoneySchema, { amount: 100, currency: "USDD" })).toBe(false);
    });

    test("has amount and currency properties", () => {
      expect(MoneySchema.properties.amount).toBeDefined();
      expect(MoneySchema.properties.currency).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Employee Status Schema
  // ---------------------------------------------------------------------------
  describe("EmployeeStatusSchema", () => {
    test("accepts all valid statuses", () => {
      expect(Value.Check(EmployeeStatusSchema, "pending")).toBe(true);
      expect(Value.Check(EmployeeStatusSchema, "active")).toBe(true);
      expect(Value.Check(EmployeeStatusSchema, "on_leave")).toBe(true);
      expect(Value.Check(EmployeeStatusSchema, "terminated")).toBe(true);
    });

    test("rejects invalid statuses", () => {
      expect(Value.Check(EmployeeStatusSchema, "hired")).toBe(false);
      expect(Value.Check(EmployeeStatusSchema, "")).toBe(false);
      expect(Value.Check(EmployeeStatusSchema, "ACTIVE")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Auth Schemas - Structural Tests
  // ---------------------------------------------------------------------------
  describe("LoginRequestSchema", () => {
    test("has email and password properties", () => {
      expect(LoginRequestSchema.properties.email).toBeDefined();
      expect(LoginRequestSchema.properties.password).toBeDefined();
    });

    test("has optional tenantSlug and rememberMe", () => {
      expect(LoginRequestSchema.properties.tenantSlug).toBeDefined();
      expect(LoginRequestSchema.properties.rememberMe).toBeDefined();
    });

    test("password has minLength constraint", () => {
      expect(LoginRequestSchema.properties.password.minLength).toBe(1);
    });
  });

  describe("MfaVerifyRequestSchema", () => {
    test("has code, method, and sessionId properties", () => {
      expect(MfaVerifyRequestSchema.properties.code).toBeDefined();
      expect(MfaVerifyRequestSchema.properties.method).toBeDefined();
      expect(MfaVerifyRequestSchema.properties.sessionId).toBeDefined();
    });

    test("code has minLength and maxLength constraints", () => {
      expect(MfaVerifyRequestSchema.properties.code.minLength).toBe(6);
      expect(MfaVerifyRequestSchema.properties.code.maxLength).toBe(8);
    });

    test("method is a union of valid MFA methods", () => {
      const methodSchema = MfaVerifyRequestSchema.properties.method;
      expect(methodSchema.anyOf).toBeDefined();
      // Should contain totp, sms, email, backup_codes
      const literals = methodSchema.anyOf.map(
        (s: { const: string }) => s.const
      );
      expect(literals).toContain("totp");
      expect(literals).toContain("sms");
      expect(literals).toContain("email");
      expect(literals).toContain("backup_codes");
    });
  });

  // ---------------------------------------------------------------------------
  // ID Parameter Schema
  // ---------------------------------------------------------------------------
  describe("IdParamSchema", () => {
    test("has id property", () => {
      expect(IdParamSchema.properties.id).toBeDefined();
    });

    test("id uses UUID format", () => {
      expect(IdParamSchema.properties.id.format).toBe("uuid");
    });
  });

  // ---------------------------------------------------------------------------
  // Search Query Schema
  // ---------------------------------------------------------------------------
  describe("SearchQuerySchema", () => {
    test("has optional q property", () => {
      expect(SearchQuerySchema.properties.q).toBeDefined();
    });

    test("accepts empty object (q is optional)", () => {
      expect(Value.Check(SearchQuerySchema, {})).toBe(true);
    });

    test("q has maxLength of 100", () => {
      // The q property is wrapped in Optional, so we check the inner constraints
      const qSchema = SearchQuerySchema.properties.q;
      expect(qSchema.maxLength).toBe(100);
    });

    test("rejects query longer than 100 characters", () => {
      const valid = Value.Check(SearchQuerySchema, { q: "a".repeat(101) });
      expect(valid).toBe(false);
    });

    test("accepts valid query string", () => {
      const valid = Value.Check(SearchQuerySchema, { q: "search term" });
      expect(valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Date Filter Schema - Structural
  // ---------------------------------------------------------------------------
  describe("DateFilterSchema", () => {
    test("has startDate and endDate properties", () => {
      expect(DateFilterSchema.properties.startDate).toBeDefined();
      expect(DateFilterSchema.properties.endDate).toBeDefined();
    });

    test("accepts empty object (both optional)", () => {
      expect(Value.Check(DateFilterSchema, {})).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Bulk Operation Schemas - Structural
  // ---------------------------------------------------------------------------
  describe("BulkIdsSchema", () => {
    test("has ids property", () => {
      expect(BulkIdsSchema.properties.ids).toBeDefined();
    });

    test("ids has minItems of 1", () => {
      expect(BulkIdsSchema.properties.ids.minItems).toBe(1);
    });

    test("ids has maxItems of 100", () => {
      expect(BulkIdsSchema.properties.ids.maxItems).toBe(100);
    });
  });

  describe("BulkResultSchema", () => {
    test("has expected properties", () => {
      expect(BulkResultSchema.properties.success).toBeDefined();
      expect(BulkResultSchema.properties.failed).toBeDefined();
      expect(BulkResultSchema.properties.totalProcessed).toBeDefined();
      expect(BulkResultSchema.properties.totalSuccess).toBeDefined();
      expect(BulkResultSchema.properties.totalFailed).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // File Upload Schema
  // ---------------------------------------------------------------------------
  describe("FileMetadataSchema", () => {
    test("has expected properties", () => {
      expect(FileMetadataSchema.properties.fileName).toBeDefined();
      expect(FileMetadataSchema.properties.fileSize).toBeDefined();
      expect(FileMetadataSchema.properties.mimeType).toBeDefined();
      expect(FileMetadataSchema.properties.url).toBeDefined();
    });

    test("validates valid file metadata without URL", () => {
      const valid = Value.Check(FileMetadataSchema, {
        fileName: "document.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
      });
      expect(valid).toBe(true);
    });

    test("rejects negative file size", () => {
      const valid = Value.Check(FileMetadataSchema, {
        fileName: "document.pdf",
        fileSize: -1,
        mimeType: "application/pdf",
      });
      expect(valid).toBe(false);
    });

    test("fileSize has minimum of 0", () => {
      expect(FileMetadataSchema.properties.fileSize.minimum).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Factory Functions
  // ---------------------------------------------------------------------------
  describe("createPaginatedResponseSchema", () => {
    test("creates schema with data array and pagination", () => {
      const ItemSchema = Type.Object({ name: Type.String() });
      const schema = createPaginatedResponseSchema(ItemSchema);

      expect(schema.properties.data).toBeDefined();
      expect(schema.properties.pagination).toBeDefined();
    });

    test("data is an array type", () => {
      const ItemSchema = Type.Object({ name: Type.String() });
      const schema = createPaginatedResponseSchema(ItemSchema);
      expect(schema.properties.data.type).toBe("array");
    });

    test("accepts custom description", () => {
      const ItemSchema = Type.Object({ name: Type.String() });
      const schema = createPaginatedResponseSchema(
        ItemSchema,
        "Custom description"
      );
      expect(schema.description).toBe("Custom description");
    });

    test("uses default description when not provided", () => {
      const ItemSchema = Type.Object({ name: Type.String() });
      const schema = createPaginatedResponseSchema(ItemSchema);
      expect(schema.description).toBe("Paginated response");
    });
  });

  describe("createSingleResponseSchema", () => {
    test("creates schema with success and data", () => {
      const ItemSchema = Type.Object({ name: Type.String() });
      const schema = createSingleResponseSchema(ItemSchema);

      expect(schema.properties.success).toBeDefined();
      expect(schema.properties.data).toBeDefined();
    });

    test("success is literal true", () => {
      const ItemSchema = Type.Object({ name: Type.String() });
      const schema = createSingleResponseSchema(ItemSchema);
      expect(schema.properties.success.const).toBe(true);
    });

    test("validates valid single response", () => {
      const ItemSchema = Type.Object({ name: Type.String() });
      const schema = createSingleResponseSchema(ItemSchema);

      const valid = Value.Check(schema, {
        success: true,
        data: { name: "Alice" },
      });
      expect(valid).toBe(true);
    });

    test("rejects success: false", () => {
      const ItemSchema = Type.Object({ name: Type.String() });
      const schema = createSingleResponseSchema(ItemSchema);

      const valid = Value.Check(schema, {
        success: false,
        data: { name: "Alice" },
      });
      expect(valid).toBe(false);
    });

    test("accepts custom description", () => {
      const ItemSchema = Type.Object({ name: Type.String() });
      const schema = createSingleResponseSchema(ItemSchema, "Custom");
      expect(schema.description).toBe("Custom");
    });
  });
});
