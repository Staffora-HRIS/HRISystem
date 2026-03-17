/**
 * Security Module - Schema Re-exports
 *
 * Backwards-compatible barrel that re-exports all schemas from their
 * focused sub-files. New code should import directly from the domain
 * schema file (e.g., ./rbac.schemas, ./portal.schemas).
 *
 * @see rbac.schemas.ts          - Role and permission schemas
 * @see field-permission.schemas.ts - Field-level security schemas
 * @see portal.schemas.ts        - Portal access schemas
 * @see manager.schemas.ts       - Manager team and approval schemas
 */

export * from "./rbac.schemas";
export * from "./field-permission.schemas";
export * from "./portal.schemas";
export * from "./manager.schemas";
