/**
 * Equipment Module - TypeBox Schemas
 *
 * Defines validation schemas for all Equipment API endpoints.
 * Tables: equipment_catalog, equipment_requests, equipment_request_history
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const DateSchema = t.String({
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Enums (matching DB enums)
// =============================================================================

/**
 * Equipment type enum — matches app.equipment_type
 */
export const EquipmentTypeSchema = t.Union([
  t.Literal("laptop"),
  t.Literal("desktop"),
  t.Literal("monitor"),
  t.Literal("keyboard"),
  t.Literal("mouse"),
  t.Literal("headset"),
  t.Literal("phone"),
  t.Literal("mobile_device"),
  t.Literal("badge"),
  t.Literal("furniture"),
  t.Literal("software_license"),
  t.Literal("other"),
]);

export type EquipmentType = Static<typeof EquipmentTypeSchema>;

/**
 * Equipment request status enum — matches app.equipment_request_status
 */
export const EquipmentRequestStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("ordered"),
  t.Literal("received"),
  t.Literal("assigned"),
  t.Literal("rejected"),
  t.Literal("cancelled"),
]);

export type EquipmentRequestStatus = Static<typeof EquipmentRequestStatusSchema>;

/**
 * Equipment request priority
 */
export const EquipmentPrioritySchema = t.Union([
  t.Literal("low"),
  t.Literal("normal"),
  t.Literal("high"),
  t.Literal("urgent"),
]);

export type EquipmentPriority = Static<typeof EquipmentPrioritySchema>;

// =============================================================================
// Catalog Schemas
// =============================================================================

/**
 * Create catalog item request
 */
export const CreateCatalogItemSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  equipment_type: EquipmentTypeSchema,
  description: t.Optional(t.String({ maxLength: 5000 })),
  specifications: t.Optional(t.Record(t.String(), t.Unknown())),
  vendor: t.Optional(t.String({ maxLength: 100 })),
  vendor_sku: t.Optional(t.String({ maxLength: 100 })),
  unit_cost: t.Optional(t.Number({ minimum: 0 })),
  is_standard_issue: t.Optional(t.Boolean()),
  requires_approval: t.Optional(t.Boolean()),
  lead_time_days: t.Optional(t.Number({ minimum: 0 })),
});

export type CreateCatalogItem = Static<typeof CreateCatalogItemSchema>;

/**
 * Update catalog item request
 */
export const UpdateCatalogItemSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 100 }),
    equipment_type: EquipmentTypeSchema,
    description: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    specifications: t.Record(t.String(), t.Unknown()),
    vendor: t.Union([t.String({ maxLength: 100 }), t.Null()]),
    vendor_sku: t.Union([t.String({ maxLength: 100 }), t.Null()]),
    unit_cost: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    is_standard_issue: t.Boolean(),
    requires_approval: t.Boolean(),
    lead_time_days: t.Number({ minimum: 0 }),
    is_active: t.Boolean(),
  })
);

export type UpdateCatalogItem = Static<typeof UpdateCatalogItemSchema>;

/**
 * Catalog item response
 */
export const CatalogItemResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  equipment_type: EquipmentTypeSchema,
  description: t.Union([t.String(), t.Null()]),
  specifications: t.Record(t.String(), t.Unknown()),
  vendor: t.Union([t.String(), t.Null()]),
  vendor_sku: t.Union([t.String(), t.Null()]),
  unit_cost: t.Union([t.Number(), t.Null()]),
  is_standard_issue: t.Boolean(),
  requires_approval: t.Boolean(),
  lead_time_days: t.Number(),
  is_active: t.Boolean(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type CatalogItemResponse = Static<typeof CatalogItemResponseSchema>;

/**
 * Catalog filters
 */
export const CatalogFiltersSchema = t.Object({
  equipment_type: t.Optional(EquipmentTypeSchema),
  is_active: t.Optional(t.Boolean()),
  is_standard_issue: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type CatalogFilters = Static<typeof CatalogFiltersSchema>;

// =============================================================================
// Equipment Request Schemas
// =============================================================================

/**
 * Create equipment request
 */
export const CreateEquipmentRequestSchema = t.Object({
  employee_id: UuidSchema,
  onboarding_id: t.Optional(UuidSchema),
  catalog_item_id: t.Optional(UuidSchema),
  equipment_type: EquipmentTypeSchema,
  custom_description: t.Optional(t.String({ maxLength: 5000 })),
  specifications: t.Optional(t.Record(t.String(), t.Unknown())),
  quantity: t.Optional(t.Number({ minimum: 1, default: 1 })),
  priority: t.Optional(EquipmentPrioritySchema),
  needed_by: t.Optional(DateSchema),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type CreateEquipmentRequest = Static<typeof CreateEquipmentRequestSchema>;

/**
 * Update equipment request
 */
export const UpdateEquipmentRequestSchema = t.Partial(
  t.Object({
    priority: EquipmentPrioritySchema,
    needed_by: t.Union([DateSchema, t.Null()]),
    notes: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    order_reference: t.String({ maxLength: 100 }),
    expected_delivery: DateSchema,
    asset_tag: t.String({ maxLength: 100 }),
    serial_number: t.String({ maxLength: 100 }),
  })
);

export type UpdateEquipmentRequest = Static<typeof UpdateEquipmentRequestSchema>;

/**
 * Status transition request
 */
export const EquipmentStatusTransitionSchema = t.Object({
  to_status: EquipmentRequestStatusSchema,
  notes: t.Optional(t.String({ maxLength: 5000 })),
  rejection_reason: t.Optional(t.String({ maxLength: 5000 })),
  // Fulfillment fields (optional, for specific transitions)
  order_reference: t.Optional(t.String({ maxLength: 100 })),
  expected_delivery: t.Optional(DateSchema),
  asset_tag: t.Optional(t.String({ maxLength: 100 })),
  serial_number: t.Optional(t.String({ maxLength: 100 })),
});

export type EquipmentStatusTransition = Static<typeof EquipmentStatusTransitionSchema>;

/**
 * Equipment request response
 */
export const EquipmentRequestResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  onboarding_id: t.Union([UuidSchema, t.Null()]),
  catalog_item_id: t.Union([UuidSchema, t.Null()]),
  equipment_type: EquipmentTypeSchema,
  custom_description: t.Union([t.String(), t.Null()]),
  specifications: t.Record(t.String(), t.Unknown()),
  quantity: t.Number(),
  priority: t.String(),
  needed_by: t.Union([t.String(), t.Null()]),
  status: EquipmentRequestStatusSchema,
  approved_by: t.Union([UuidSchema, t.Null()]),
  approved_at: t.Union([t.String(), t.Null()]),
  rejection_reason: t.Union([t.String(), t.Null()]),
  ordered_at: t.Union([t.String(), t.Null()]),
  order_reference: t.Union([t.String(), t.Null()]),
  expected_delivery: t.Union([t.String(), t.Null()]),
  received_at: t.Union([t.String(), t.Null()]),
  assigned_at: t.Union([t.String(), t.Null()]),
  asset_tag: t.Union([t.String(), t.Null()]),
  serial_number: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type EquipmentRequestResponse = Static<typeof EquipmentRequestResponseSchema>;

/**
 * Equipment request filters
 */
export const EquipmentRequestFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  onboarding_id: t.Optional(UuidSchema),
  equipment_type: t.Optional(EquipmentTypeSchema),
  status: t.Optional(EquipmentRequestStatusSchema),
  priority: t.Optional(EquipmentPrioritySchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type EquipmentRequestFilters = Static<typeof EquipmentRequestFiltersSchema>;

/**
 * Equipment request history entry
 */
export const EquipmentRequestHistorySchema = t.Object({
  id: UuidSchema,
  request_id: UuidSchema,
  from_status: t.Union([EquipmentRequestStatusSchema, t.Null()]),
  to_status: EquipmentRequestStatusSchema,
  notes: t.Union([t.String(), t.Null()]),
  changed_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
});

export type EquipmentRequestHistory = Static<typeof EquipmentRequestHistorySchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
