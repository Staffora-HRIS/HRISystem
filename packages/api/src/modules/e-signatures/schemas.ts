/**
 * E-Signatures Module - TypeBox Schemas
 *
 * Defines validation schemas for e-signature request operations.
 * Supports internal "I agree" signatures and external provider placeholders
 * (DocuSign, HelloSign).
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const SignatureProviderSchema = t.Union([
  t.Literal("internal"),
  t.Literal("docusign"),
  t.Literal("hellosign"),
]);

export const SignatureStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("sent"),
  t.Literal("viewed"),
  t.Literal("signed"),
  t.Literal("declined"),
  t.Literal("expired"),
  t.Literal("cancelled"),
  t.Literal("voided"),
]);

// =============================================================================
// Request Schemas
// =============================================================================

export const CreateSignatureRequestSchema = t.Object({
  document_id: t.String({ format: "uuid" }),
  signer_employee_id: t.Optional(t.String({ format: "uuid" })),
  signer_email: t.String({ format: "email", maxLength: 320 }),
  provider: t.Optional(SignatureProviderSchema),
  message: t.Optional(t.String({ maxLength: 2000 })),
  expires_at: t.Optional(t.String({ format: "date-time" })),
  signature_statement: t.Optional(t.String({ minLength: 1, maxLength: 1000 })),
});

export const SignInternalSchema = t.Object({
  agreement: t.Literal(true, {
    description: "Must be true to confirm the signer agrees to the document",
  }),
});

export const DeclineSignatureSchema = t.Object({
  reason: t.Optional(t.String({ maxLength: 2000 })),
});

export const CancelSignatureSchema = t.Object({
  reason: t.Optional(t.String({ maxLength: 2000 })),
});

export const SendReminderSchema = t.Object({
  message: t.Optional(t.String({ maxLength: 2000 })),
});

export const SignatureRequestFiltersSchema = t.Object({
  document_id: t.Optional(t.String({ format: "uuid" })),
  signer_employee_id: t.Optional(t.String({ format: "uuid" })),
  signer_email: t.Optional(t.String()),
  provider: t.Optional(SignatureProviderSchema),
  status: t.Optional(SignatureStatusSchema),
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

// =============================================================================
// Response Schemas
// =============================================================================

export const SignatureRequestResponseSchema = t.Object({
  id: t.String(),
  tenant_id: t.String(),
  document_id: t.String(),
  signer_employee_id: t.Union([t.String(), t.Null()]),
  signer_employee_name: t.Optional(t.String()),
  signer_email: t.String(),
  provider: SignatureProviderSchema,
  provider_reference: t.Union([t.String(), t.Null()]),
  status: SignatureStatusSchema,
  message: t.Union([t.String(), t.Null()]),
  signature_statement: t.Union([t.String(), t.Null()]),
  sent_at: t.Union([t.String(), t.Null()]),
  viewed_at: t.Union([t.String(), t.Null()]),
  signed_at: t.Union([t.String(), t.Null()]),
  declined_at: t.Union([t.String(), t.Null()]),
  expires_at: t.Union([t.String(), t.Null()]),
  signed_document_url: t.Union([t.String(), t.Null()]),
  decline_reason: t.Union([t.String(), t.Null()]),
  reminder_count: t.Number(),
  requested_by: t.String(),
  requested_by_name: t.Optional(t.String()),
  created_at: t.String(),
  updated_at: t.String(),
});

export const SignatureEventResponseSchema = t.Object({
  id: t.String(),
  signature_request_id: t.String(),
  from_status: t.Union([t.String(), t.Null()]),
  to_status: t.String(),
  actor_id: t.Union([t.String(), t.Null()]),
  metadata: t.Optional(t.Record(t.String(), t.Unknown())),
  created_at: t.String(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type SignatureProvider = Static<typeof SignatureProviderSchema>;
export type SignatureStatus = Static<typeof SignatureStatusSchema>;
export type CreateSignatureRequest = Static<typeof CreateSignatureRequestSchema>;
export type SignInternal = Static<typeof SignInternalSchema>;
export type DeclineSignature = Static<typeof DeclineSignatureSchema>;
export type CancelSignature = Static<typeof CancelSignatureSchema>;
export type SignatureRequestFilters = Static<typeof SignatureRequestFiltersSchema>;
export type SignatureRequestResponse = Static<typeof SignatureRequestResponseSchema>;
export type SignatureEventResponse = Static<typeof SignatureEventResponseSchema>;
