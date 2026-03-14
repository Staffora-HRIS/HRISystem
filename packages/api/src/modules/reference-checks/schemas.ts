/**
 * Reference Checks Module Schemas
 *
 * TypeBox schemas for reference check API validation
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
// Reference Check Schemas
// =============================================================================

export const RefereeRelationshipSchema = t.Union([
  t.Literal("manager"),
  t.Literal("colleague"),
  t.Literal("academic"),
  t.Literal("character"),
]);

export const ReferenceCheckStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("sent"),
  t.Literal("received"),
  t.Literal("verified"),
  t.Literal("failed"),
]);

export const CreateReferenceCheckSchema = t.Object({
  candidateId: t.Optional(UuidSchema),
  employeeId: t.Optional(UuidSchema),
  refereeName: t.String({ minLength: 1, maxLength: 255 }),
  refereeEmail: t.String({ format: "email", maxLength: 255 }),
  refereePhone: t.Optional(t.String({ maxLength: 50 })),
  refereeRelationship: RefereeRelationshipSchema,
  companyName: t.Optional(t.String({ maxLength: 255 })),
  jobTitle: t.Optional(t.String({ maxLength: 255 })),
  datesFrom: t.Optional(t.String({ format: "date" })),
  datesTo: t.Optional(t.String({ format: "date" })),
});

export const UpdateReferenceCheckSchema = t.Partial(
  t.Object({
    refereeName: t.String({ minLength: 1, maxLength: 255 }),
    refereeEmail: t.String({ format: "email", maxLength: 255 }),
    refereePhone: t.Union([t.String({ maxLength: 50 }), t.Null()]),
    refereeRelationship: RefereeRelationshipSchema,
    companyName: t.Union([t.String({ maxLength: 255 }), t.Null()]),
    jobTitle: t.Union([t.String({ maxLength: 255 }), t.Null()]),
    datesFrom: t.Union([t.String({ format: "date" }), t.Null()]),
    datesTo: t.Union([t.String({ format: "date" }), t.Null()]),
    referenceContent: t.Union([t.String(), t.Null()]),
    verificationNotes: t.Union([t.String(), t.Null()]),
    satisfactory: t.Union([t.Boolean(), t.Null()]),
  })
);

export const VerifyReferenceCheckSchema = t.Object({
  verificationNotes: t.Optional(t.String()),
  satisfactory: t.Boolean(),
});

export const ReferenceCheckFiltersSchema = t.Object({
  candidateId: t.Optional(UuidSchema),
  employeeId: t.Optional(UuidSchema),
  status: t.Optional(ReferenceCheckStatusSchema),
  search: t.Optional(t.String()),
});
