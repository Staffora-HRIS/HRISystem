/**
 * Bank Details Module - TypeBox Schemas
 *
 * Defines validation schemas for all Bank Details API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * Bank details are sensitive employee sub-resources with effective-dating
 * support. Sort code format: 6 digits (NN-NN-NN stored without hyphens).
 * Account number: 8 digits.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common
// =============================================================================

/**
 * UUID validation schema
 */
export const UuidSchema = t.String({ format: "uuid" });

/**
 * Pagination query parameters (cursor-based)
 */
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.String({ pattern: "^[0-9]+$" })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Params
// =============================================================================

/**
 * Generic ID params for single resource routes
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

/**
 * Employee ID params for employee-scoped routes
 */
export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

/**
 * Combined employee + bank detail ID params
 */
export const EmployeeBankDetailParamsSchema = t.Object({
  employeeId: UuidSchema,
  id: UuidSchema,
});

export type EmployeeBankDetailParams = Static<typeof EmployeeBankDetailParamsSchema>;

// =============================================================================
// Headers
// =============================================================================

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create bank detail request body.
 *
 * sort_code: 6 digits (no hyphens), e.g. "123456"
 * account_number: 8 digits, e.g. "12345678"
 */
export const CreateBankDetailSchema = t.Object({
  account_name: t.String({ minLength: 1, maxLength: 255 }),
  sort_code: t.String({ pattern: "^[0-9]{6}$", minLength: 6, maxLength: 6 }),
  account_number: t.String({ pattern: "^[0-9]{8}$", minLength: 8, maxLength: 8 }),
  bank_name: t.Optional(t.Union([t.String({ maxLength: 255 }), t.Null()])),
  building_society_reference: t.Optional(t.Union([t.String({ maxLength: 50 }), t.Null()])),
  is_primary: t.Optional(t.Boolean()),
  effective_from: t.Optional(t.String({ format: "date" })),
  effective_to: t.Optional(t.Union([t.String({ format: "date" }), t.Null()])),
});

export type CreateBankDetail = Static<typeof CreateBankDetailSchema>;

/**
 * Update bank detail request body (all fields optional)
 */
export const UpdateBankDetailSchema = t.Partial(
  t.Object({
    account_name: t.String({ minLength: 1, maxLength: 255 }),
    sort_code: t.String({ pattern: "^[0-9]{6}$", minLength: 6, maxLength: 6 }),
    account_number: t.String({ pattern: "^[0-9]{8}$", minLength: 8, maxLength: 8 }),
    bank_name: t.Union([t.String({ maxLength: 255 }), t.Null()]),
    building_society_reference: t.Union([t.String({ maxLength: 50 }), t.Null()]),
    is_primary: t.Boolean(),
    effective_from: t.String({ format: "date" }),
    effective_to: t.Union([t.String({ format: "date" }), t.Null()]),
  })
);

export type UpdateBankDetail = Static<typeof UpdateBankDetailSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Bank detail response schema
 */
export const BankDetailResponseSchema = t.Object({
  id: t.String(),
  employeeId: t.String(),
  accountName: t.String(),
  sortCode: t.String(),
  accountNumber: t.String(),
  bankName: t.Union([t.String(), t.Null()]),
  buildingSocietyReference: t.Union([t.String(), t.Null()]),
  isPrimary: t.Boolean(),
  effectiveFrom: t.String(),
  effectiveTo: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type BankDetailResponse = Static<typeof BankDetailResponseSchema>;

/**
 * List response schema with cursor-based pagination
 */
export const BankDetailListResponseSchema = t.Object({
  items: t.Array(BankDetailResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type BankDetailListResponse = Static<typeof BankDetailListResponseSchema>;
