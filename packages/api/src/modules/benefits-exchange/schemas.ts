/**
 * Benefits Exchange Module - TypeBox Schemas
 *
 * Defines request/response schemas for Benefits Provider Data Exchange.
 */

import { Type, type Static } from "@sinclair/typebox";

// =============================================================================
// Enums
// =============================================================================

export const ExchangeType = Type.Union([
  Type.Literal("enrollment"),
  Type.Literal("termination"),
  Type.Literal("change"),
]);

export type ExchangeType = Static<typeof ExchangeType>;

export const ExchangeDirection = Type.Union([
  Type.Literal("outbound"),
  Type.Literal("inbound"),
]);

export type ExchangeDirection = Static<typeof ExchangeDirection>;

export const ExchangeFileFormat = Type.Union([
  Type.Literal("csv"),
  Type.Literal("xml"),
  Type.Literal("json"),
]);

export type ExchangeFileFormat = Static<typeof ExchangeFileFormat>;

export const ExchangeStatus = Type.Union([
  Type.Literal("pending"),
  Type.Literal("sent"),
  Type.Literal("acknowledged"),
  Type.Literal("error"),
]);

export type ExchangeStatus = Static<typeof ExchangeStatus>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Request body for POST /benefits-exchange/generate
 * Generates an outbound exchange file for a provider.
 */
export const GenerateExchangeFile = Type.Object({
  provider_id: Type.String({ format: "uuid" }),
  exchange_type: ExchangeType,
  file_format: ExchangeFileFormat,
  payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export type GenerateExchangeFile = Static<typeof GenerateExchangeFile>;

/**
 * Request body for POST /benefits-exchange/inbound
 * Processes an inbound exchange file from a provider.
 */
export const ProcessInboundFile = Type.Object({
  provider_id: Type.String({ format: "uuid" }),
  exchange_type: ExchangeType,
  file_format: ExchangeFileFormat,
  payload: Type.Record(Type.String(), Type.Unknown()),
});

export type ProcessInboundFile = Static<typeof ProcessInboundFile>;

// =============================================================================
// Query Schemas
// =============================================================================

export const ExchangeHistoryQuery = Type.Object({
  provider_id: Type.Optional(Type.String({ format: "uuid" })),
  exchange_type: Type.Optional(ExchangeType),
  direction: Type.Optional(ExchangeDirection),
  status: Type.Optional(ExchangeStatus),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  cursor: Type.Optional(Type.String()),
});

export type ExchangeHistoryQuery = Static<typeof ExchangeHistoryQuery>;

// =============================================================================
// Response Schemas
// =============================================================================

export const DataExchangeResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  tenant_id: Type.String({ format: "uuid" }),
  provider_id: Type.String({ format: "uuid" }),
  provider_name: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  exchange_type: ExchangeType,
  direction: ExchangeDirection,
  file_format: ExchangeFileFormat,
  status: ExchangeStatus,
  payload: Type.Any(),
  sent_at: Type.Union([Type.String(), Type.Null()]),
  acknowledged_at: Type.Union([Type.String(), Type.Null()]),
  error_message: Type.Union([Type.String(), Type.Null()]),
  created_at: Type.String(),
  updated_at: Type.String(),
});

export type DataExchangeResponse = Static<typeof DataExchangeResponse>;

// =============================================================================
// Pagination
// =============================================================================

export const PaginationQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  cursor: Type.Optional(Type.String()),
});

export type PaginationQuery = Static<typeof PaginationQuery>;
