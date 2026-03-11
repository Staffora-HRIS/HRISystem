/**
 * Common Types
 *
 * Shared type definitions used across the Staffora platform.
 * These types provide a foundation for consistent data structures.
 */

// =============================================================================
// Primitive Type Aliases
// =============================================================================

/** UUID string type for entity identifiers */
export type UUID = string;

/** ISO 8601 date string (YYYY-MM-DD) */
export type DateString = string;

/** ISO 8601 timestamp string (YYYY-MM-DDTHH:mm:ss.sssZ) */
export type TimestampString = string;

// =============================================================================
// Pagination Types
// =============================================================================

/** Standard pagination parameters for list endpoints */
export interface PaginationParams {
  /** Page number (1-indexed) */
  page?: number;
  /** Number of items per page */
  pageSize?: number;
}

/** Cursor-based pagination parameters for efficient traversal of large datasets */
export interface CursorPaginationParams {
  /** Cursor pointing to the start position */
  cursor?: string;
  /** Number of items to return */
  limit?: number;
  /** Direction of traversal */
  direction?: "forward" | "backward";
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  /** The items for the current page */
  data: T[];
  /** Pagination metadata */
  pagination: {
    /** Current page number */
    page: number;
    /** Items per page */
    pageSize: number;
    /** Total number of items across all pages */
    totalItems: number;
    /** Total number of pages */
    totalPages: number;
    /** Whether there is a next page */
    hasNextPage: boolean;
    /** Whether there is a previous page */
    hasPreviousPage: boolean;
  };
}

/** Cursor-based paginated response */
export interface CursorPaginatedResponse<T> {
  /** The items for the current page */
  data: T[];
  /** Cursor pagination metadata */
  pagination: {
    /** Cursor for the next page */
    nextCursor: string | null;
    /** Cursor for the previous page */
    previousCursor: string | null;
    /** Whether there are more items */
    hasMore: boolean;
    /** Number of items returned */
    count: number;
  };
}

// =============================================================================
// Sorting Types
// =============================================================================

/** Sort direction */
export type SortDirection = "asc" | "desc";

/** Generic sort parameters */
export interface SortParams<T extends string = string> {
  /** Field to sort by */
  sortBy?: T;
  /** Sort direction */
  sortDirection?: SortDirection;
}

/** Multiple sort criteria */
export interface MultiSortParams<T extends string = string> {
  /** Array of sort criteria */
  sort?: Array<{
    field: T;
    direction: SortDirection;
  }>;
}

// =============================================================================
// API Response Types
// =============================================================================

/** Standard successful API response wrapper */
export interface ApiResponse<T> {
  /** Indicates success */
  success: true;
  /** Response data */
  data: T;
  /** Optional metadata */
  meta?: Record<string, unknown>;
}

/** Standard error response */
export interface ApiError {
  /** Indicates failure */
  success: false;
  /** Error details */
  error: {
    /** Error code identifier */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Optional additional details */
    details?: Record<string, unknown>;
    /** Optional field-level validation errors */
    fieldErrors?: Record<string, string[]>;
    /** Request ID for tracing */
    requestId?: string;
  };
}

/** Union type for API responses */
export type ApiResult<T> = ApiResponse<T> | ApiError;

// =============================================================================
// Date Range Types
// =============================================================================

/**
 * Date range for effective dating patterns.
 * Used throughout the system for temporal data management.
 */
export interface DateRange {
  /** Start date of the range (inclusive) */
  effectiveFrom: DateString;
  /** End date of the range (inclusive), null for currently effective records */
  effectiveTo: DateString | null;
}

/**
 * Effective dated record mixin.
 * Add this to entities that require temporal versioning.
 */
export interface EffectiveDated {
  /** Date when this record becomes effective */
  effectiveFrom: DateString;
  /** Date when this record is no longer effective (null = currently active) */
  effectiveTo: DateString | null;
}

// =============================================================================
// Base Entity Types
// =============================================================================

/** Base entity with standard audit fields */
export interface BaseEntity {
  /** Unique identifier */
  id: UUID;
  /** Creation timestamp */
  createdAt: TimestampString;
  /** Last update timestamp */
  updatedAt: TimestampString;
}

/** Base entity with soft delete support */
export interface SoftDeletableEntity extends BaseEntity {
  /** Deletion timestamp (null if not deleted) */
  deletedAt: TimestampString | null;
}

/** Base entity with tenant scope */
export interface TenantScopedEntity extends BaseEntity {
  /** Tenant identifier */
  tenantId: UUID;
}

/** Base entity with both tenant scope and soft delete */
export interface TenantScopedSoftDeletableEntity extends TenantScopedEntity {
  /** Deletion timestamp (null if not deleted) */
  deletedAt: TimestampString | null;
}

// =============================================================================
// Filter Types
// =============================================================================

/** Generic filter operator */
export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "nin"
  | "like"
  | "ilike"
  | "between"
  | "isNull"
  | "isNotNull";

/** Generic filter condition */
export interface FilterCondition<T = unknown> {
  /** Field to filter on */
  field: string;
  /** Filter operator */
  operator: FilterOperator;
  /** Value to compare against */
  value: T;
}

// =============================================================================
// Audit Types
// =============================================================================

/** Audit metadata for tracking changes */
export interface AuditMetadata {
  /** User who created the record */
  createdBy: UUID;
  /** User who last updated the record */
  updatedBy: UUID;
  /** User who deleted the record (if soft deleted) */
  deletedBy?: UUID;
}

// =============================================================================
// Localization Types
// =============================================================================

/** Localized string with translations */
export interface LocalizedString {
  /** Default value (typically in English) */
  default: string;
  /** Translations keyed by locale code */
  translations?: Record<string, string>;
}

// =============================================================================
// Money Types
// =============================================================================

/** Monetary amount with currency */
export interface Money {
  /** Amount in smallest currency unit (e.g., cents) */
  amount: number;
  /** ISO 4217 currency code */
  currency: string;
}
