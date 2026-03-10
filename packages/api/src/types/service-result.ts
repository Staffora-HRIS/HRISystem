/**
 * Shared Service Result Types
 *
 * Canonical definitions for service return types used across all modules.
 * Import from here instead of defining locally.
 */

/**
 * Standard service result wrapper
 */
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Paginated result (flat shape, no success/error wrapper).
 * Used by services that return cursor-based paginated lists.
 */
export interface PaginatedServiceResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Tenant context for repository and service operations.
 * This is the simplified context passed to data access layers.
 */
export interface TenantContext {
  tenantId: string;
  userId?: string;
}
