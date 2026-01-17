/**
 * HRIS Platform Plugins
 *
 * This module exports all Elysia plugins for the HRIS platform.
 * Plugins should be registered in a specific order due to dependencies:
 *
 * 1. errorsPlugin - Error handling and request ID generation
 * 2. dbPlugin - Database connectivity
 * 3. cachePlugin - Redis caching
 * 4. tenantPlugin - Tenant resolution (depends on db, cache)
 * 5. authPlugin - Authentication (depends on db, cache)
 * 6. rbacPlugin - Authorization (depends on db, cache, auth, tenant)
 * 7. idempotencyPlugin - Idempotency (depends on db, cache, auth, tenant)
 * 8. auditPlugin - Audit logging (depends on db, auth, tenant)
 */

// Core infrastructure plugins
export { dbPlugin, getDbClient, closeDbClient, hashRequestBody } from "./db";
export type {
  DbConfig,
  TenantContext,
  TransactionOptions,
  QueryResult,
  Sql,
  TransactionSql,
  Row,
} from "./db";
export { DatabaseClient } from "./db";

export { cachePlugin, getCacheClient, closeCacheClient, CacheTTL, CacheKeys } from "./cache";
export type { CacheConfig } from "./cache";
export { CacheClient } from "./cache";

export { rateLimitPlugin } from "./rate-limit";
export type { RateLimitPluginOptions } from "./rate-limit";

export { securityHeadersPlugin, apiSecurityHeaders, webAppSecurityHeaders } from "./security-headers";
export type { SecurityHeadersOptions, ContentSecurityPolicy } from "./security-headers";

export { tenantPlugin, requireTenant, hasTenant, TenantService, TenantError, TenantErrorCodes, resolveTenant, resolveTenantWithFallback } from "./tenant";
export type { Tenant, TenantContext as TenantCtx, TenantSource, TenantResolutionOptions } from "./tenant";

export { authPlugin, requireAuth, requireMfa, requireCsrf, AuthService, AuthError, AuthErrorCodes } from "./auth-better";
export type { User, Session, AuthContext, UnauthContext, AuthState, UserWithTenants, AuthPluginOptions } from "./auth-better";

export { rbacPlugin, requirePermission, requireAnyPermission, requireAllPermissions, hasPermission, RbacService, RbacError, RbacErrorCodes } from "./rbac";
export type { Permission, PermissionConstraints, Role, EffectivePermissions, PermissionCheckResult } from "./rbac";

// Audit logging
export { auditPlugin, AuditService, AuditActions, createAuditLogger, createAuditContext, extractClientIp, extractUserAgent, compareObjects, sanitizeAuditData } from "./audit";
export type { AuditEntry, AuditContext, AuditLogOptions } from "./audit";

// Error handling
export {
  errorsPlugin,
  ErrorCodes,
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  generateRequestId,
  createErrorResponse,
  isValidUuid,
  isValidEmail,
  assertValid,
  assertFound,
  ok,
  err,
  isOk,
  isErr,
} from "./errors";
export type { ErrorResponse, ErrorCode, Result, Ok, Err } from "./errors";

// Idempotency
export {
  idempotencyPlugin,
  requireIdempotency,
  handleIdempotentRequest,
  IdempotencyService,
  IdempotencyError,
  IdempotencyErrorCodes,
} from "./idempotency";
export type {
  IdempotencyRecord,
  IdempotencyCheckResult,
  IdempotencyContext,
  IdempotencyPluginOptions,
} from "./idempotency";

// Better Auth integration
export {
  betterAuthPlugin,
  betterAuthSession,
  requireBetterAuth,
  getBetterAuth,
} from "../lib/better-auth-handler";
export type { Auth, BetterAuthSession, BetterAuthUser } from "../lib/better-auth";
