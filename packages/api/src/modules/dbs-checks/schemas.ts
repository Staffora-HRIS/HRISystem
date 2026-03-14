/**
 * DBS Checks Module Schemas
 *
 * TypeBox schemas for DBS (Disclosure and Barring Service) check API validation
 */

import { t } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  description: "UUID identifier",
});

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

// =============================================================================
// DBS Check Schemas
// =============================================================================

export const DbsCheckLevelSchema = t.Union([
  t.Literal("basic"),
  t.Literal("standard"),
  t.Literal("enhanced"),
  t.Literal("enhanced_barred"),
]);

export const DbsCheckStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("submitted"),
  t.Literal("received"),
  t.Literal("clear"),
  t.Literal("flagged"),
  t.Literal("expired"),
]);

export const CreateDbsCheckSchema = t.Object({
  employeeId: UuidSchema,
  checkLevel: DbsCheckLevelSchema,
  notes: t.Optional(t.String()),
});

export const UpdateDbsCheckSchema = t.Partial(
  t.Object({
    checkLevel: DbsCheckLevelSchema,
    certificateNumber: t.Union([t.String({ maxLength: 50 }), t.Null()]),
    issueDate: t.Union([t.String({ format: "date" }), t.Null()]),
    dbsUpdateServiceRegistered: t.Boolean(),
    updateServiceId: t.Union([t.String({ maxLength: 50 }), t.Null()]),
    result: t.Union([t.String(), t.Null()]),
    expiryDate: t.Union([t.String({ format: "date" }), t.Null()]),
    notes: t.Union([t.String(), t.Null()]),
  })
);

export const SubmitDbsCheckSchema = t.Object({
  certificateNumber: t.Optional(t.String({ maxLength: 50 })),
  notes: t.Optional(t.String()),
});

export const RecordDbsResultSchema = t.Object({
  certificateNumber: t.String({ minLength: 1, maxLength: 50 }),
  issueDate: t.String({ format: "date" }),
  result: t.Optional(t.String()),
  expiryDate: t.Optional(t.String({ format: "date" })),
  dbsUpdateServiceRegistered: t.Optional(t.Boolean()),
  updateServiceId: t.Optional(t.String({ maxLength: 50 })),
  clear: t.Boolean({ description: "Whether the check came back clear (true) or flagged (false)" }),
});

export const DbsCheckFiltersSchema = t.Object({
  employeeId: t.Optional(UuidSchema),
  status: t.Optional(DbsCheckStatusSchema),
  checkLevel: t.Optional(DbsCheckLevelSchema),
  search: t.Optional(t.String()),
});
