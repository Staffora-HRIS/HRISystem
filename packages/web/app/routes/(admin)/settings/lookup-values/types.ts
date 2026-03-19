/**
 * Lookup Values — shared types and constants
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface LookupCategory {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  valueCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LookupValue {
  id: string;
  tenantId: string;
  categoryId: string;
  categoryCode?: string;
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
