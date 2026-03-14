/**
 * Shared Pagination Helpers
 *
 * Provides utilities for cursor-based pagination used across all repository
 * list operations. Centralizes the "fetch limit+1, check hasMore, slice"
 * pattern that is duplicated 160+ times in the codebase.
 *
 * Two result shapes are supported to match existing module conventions:
 * - `PaginatedResult` uses `{ items, nextCursor, hasMore, total? }` (HR module style)
 * - `PaginatedDataResult` uses `{ data, cursor, hasMore }` (absence/cases style)
 *
 * TypeBox schemas are provided for route-level validation:
 * - `PaginationQuerySchema` validates cursor/limit query params
 * - `PaginatedResponseSchema(itemSchema)` wraps an item schema in a paginated response
 *
 * Usage in a repository:
 * ```typescript
 * import {
 *   parsePaginationParams,
 *   buildPaginatedResult,
 *   type PaginationParams,
 *   type PaginatedResult,
 * } from "../../lib/pagination";
 *
 * async findItems(ctx, filters, pagination: PaginationParams): Promise<PaginatedResult<ItemRow>> {
 *   const { limit, cursor } = parsePaginationParams(pagination);
 *   const fetchLimit = limit + 1;
 *
 *   const rows = await this.db.withTransaction(ctx, async (tx) => {
 *     return tx<ItemRow[]>`
 *       SELECT ... FROM items
 *       WHERE ...
 *       ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
 *       ORDER BY created_at DESC, id DESC
 *       LIMIT ${fetchLimit}
 *     `;
 *   });
 *
 *   return buildPaginatedResult(rows, limit);
 * }
 * ```
 *
 * Usage in a route handler with TypeBox validation:
 * ```typescript
 * import { PaginationQuerySchema, PaginatedResponseSchema } from "../../lib/pagination";
 *
 * app.get("/items", {
 *   query: t.Intersect([PaginationQuerySchema, ItemFiltersSchema]),
 *   response: PaginatedResponseSchema(ItemResponseSchema),
 * }, async ({ query }) => {
 *   const pagination = parsePaginationParams(query);
 *   // ...
 * });
 * ```
 */

import { t, type Static } from "elysia";

// =============================================================================
// Types
// =============================================================================

/**
 * Input parameters for cursor-based pagination.
 * Matches the shape accepted by list endpoints across all modules.
 */
export interface PaginationParams {
  cursor?: string;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * Paginated result using `items` key (HR module convention).
 * Used by: hr, talent, lms, workflows, onboarding, succession, competencies, recruitment
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

/**
 * Paginated result using `data` key (absence/cases convention).
 * Used by: absence, cases, time, portal, benefits, documents
 */
export interface PaginatedDataResult<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Default number of items per page when no limit is specified */
export const DEFAULT_PAGE_LIMIT = 20;

/** Maximum allowed items per page to prevent excessive memory use */
export const MAX_PAGE_LIMIT = 100;

// =============================================================================
// TypeBox Schemas
// =============================================================================

/**
 * TypeBox schema for cursor-based pagination query parameters.
 *
 * Validates `cursor` (optional opaque string) and `limit` (optional integer,
 * default 20, clamped to 1..100). Use this in route definitions to validate
 * pagination query params at the handler level.
 *
 * Can be composed with filter schemas using `t.Intersect`:
 * ```typescript
 * query: t.Intersect([PaginationQuerySchema, MyFiltersSchema])
 * ```
 */
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(
    t.Number({ minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT })
  ),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

/**
 * TypeBox schema factory for paginated responses (items-style).
 *
 * Wraps any item schema in the standard paginated response envelope:
 * `{ items: T[], nextCursor: string | null, hasMore: boolean, total?: number }`
 *
 * @param itemSchema - TypeBox schema for a single item in the result set
 * @returns TypeBox schema for the full paginated response
 *
 * @example
 * ```typescript
 * const ListResponse = PaginatedResponseSchema(EmployeeResponseSchema);
 * ```
 */
export const PaginatedResponseSchema = <T extends ReturnType<typeof t.Object>>(
  itemSchema: T
) =>
  t.Object({
    items: t.Array(itemSchema),
    nextCursor: t.Union([t.String(), t.Null()]),
    hasMore: t.Boolean(),
    total: t.Optional(t.Number()),
  });

/**
 * TypeBox schema factory for paginated responses (data-style).
 *
 * Wraps any item schema in the data-style paginated response envelope:
 * `{ data: T[], cursor: string | null, hasMore: boolean }`
 *
 * @param itemSchema - TypeBox schema for a single item in the result set
 * @returns TypeBox schema for the full paginated response
 */
export const PaginatedDataResponseSchema = <
  T extends ReturnType<typeof t.Object>,
>(
  itemSchema: T
) =>
  t.Object({
    data: t.Array(itemSchema),
    cursor: t.Union([t.String(), t.Null()]),
    hasMore: t.Boolean(),
  });

// =============================================================================
// Functions
// =============================================================================

/**
 * Parse and validate pagination parameters from a request query.
 *
 * - Clamps `limit` between 1 and MAX_PAGE_LIMIT (default: DEFAULT_PAGE_LIMIT)
 * - Strips falsy cursor values to undefined
 * - Defaults `sortBy` to "created_at"
 * - Defaults `sortOrder` to "desc"
 *
 * This is the primary entry point for repositories to extract safe pagination
 * values from raw query params.
 *
 * @param params - Raw pagination parameters from the request query
 * @returns Normalized parameters safe for use in queries
 */
export function parsePaginationParams(
  params: PaginationParams
): Required<Omit<PaginationParams, "cursor">> & { cursor?: string } {
  return {
    cursor: params.cursor || undefined,
    limit: Math.min(
      Math.max(1, params.limit || DEFAULT_PAGE_LIMIT),
      MAX_PAGE_LIMIT
    ),
    sortBy: params.sortBy || "created_at",
    sortOrder: params.sortOrder === "asc" ? "asc" : "desc",
  };
}

/**
 * Alias for `parsePaginationParams` to maintain backward compatibility.
 * Existing code that uses `normalizePaginationParams` will continue to work.
 */
export const normalizePaginationParams = parsePaginationParams;

/**
 * Build a paginated result from query rows (items-style).
 *
 * Assumes the caller fetched `limit + 1` rows. If more rows than `limit`
 * were returned, the extra row is trimmed and `hasMore` is set to true.
 * The cursor for the next page is taken from the last included item's
 * `cursorField` (defaults to "id").
 *
 * @param rows - Rows returned from the database (should be limit + 1 max)
 * @param limit - The page size requested by the client
 * @param cursorField - The field to use as the cursor value (default: "id")
 * @returns A `PaginatedResult` with items, nextCursor, and hasMore
 */
export function buildPaginatedResult<T extends Record<string, any>>(
  rows: T[],
  limit: number,
  cursorField: string = "id"
): PaginatedResult<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem ? String(lastItem[cursorField]) : null;

  return {
    items,
    nextCursor,
    hasMore,
  };
}

/**
 * Build a paginated result from query rows (data-style).
 *
 * Same logic as `buildPaginatedResult` but returns the shape used by
 * the absence, cases, and time modules: `{ data, cursor, hasMore }`.
 *
 * @param rows - Rows returned from the database (should be limit + 1 max)
 * @param limit - The page size requested by the client
 * @param cursorField - The field to use as the cursor value (default: "id")
 * @returns A `PaginatedDataResult` with data, cursor, and hasMore
 */
export function buildPaginatedDataResult<T extends Record<string, any>>(
  rows: T[],
  limit: number,
  cursorField: string = "id"
): PaginatedDataResult<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = data[data.length - 1];
  const cursor =
    hasMore && lastItem ? String(lastItem[cursorField]) : null;

  return {
    data,
    cursor,
    hasMore,
  };
}

/**
 * Build a paginated response and apply a mapping function to each row.
 *
 * Convenience wrapper that combines `buildPaginatedResult` with a row mapper,
 * avoiding the need to map items separately after pagination slicing.
 *
 * @param rows - Rows returned from the database (should be limit + 1 max)
 * @param limit - The page size requested by the client
 * @param mapFn - Function to transform each row into the response shape
 * @param cursorField - The field to use as the cursor value (default: "id")
 * @returns A `PaginatedResult` with mapped items, nextCursor, and hasMore
 */
export function buildMappedPaginatedResult<
  TRow extends Record<string, any>,
  TResponse,
>(
  rows: TRow[],
  limit: number,
  mapFn: (row: TRow) => TResponse,
  cursorField: string = "id"
): PaginatedResult<TResponse> {
  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = sliced[sliced.length - 1];
  const nextCursor =
    hasMore && lastItem ? String(lastItem[cursorField]) : null;

  return {
    items: sliced.map(mapFn),
    nextCursor,
    hasMore,
  };
}

/**
 * Compute the fetch limit to pass to SQL queries.
 *
 * Always returns `limit + 1` so the caller can detect whether more
 * rows exist beyond the current page.
 *
 * @param limit - The normalized page size
 * @returns limit + 1
 */
export function getFetchLimit(limit: number): number {
  return limit + 1;
}
