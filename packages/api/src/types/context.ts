/**
 * Elysia Context Type Declarations
 * 
 * This file provides type augmentation for Elysia's context
 * to include properties injected by our plugins.
 */

import type { DatabaseClient } from "../plugins/db";
import type { CacheClient } from "../plugins/cache";
import type { Tenant } from "../plugins/tenant";
import type { User, Session } from "../plugins/auth";

/**
 * Extended context with all plugin-injected properties
 */
export interface HRISContext {
  db: DatabaseClient;
  cache: CacheClient;
  tenant: Tenant | null;
  user: User | null;
  session: Session | null;
  requestId: string;
}

/**
 * Context for authenticated routes
 */
export interface AuthenticatedContext extends HRISContext {
  tenant: Tenant;
  user: User;
  session: Session;
}

/**
 * Context for tenant-aware routes (may not require auth)
 */
export interface TenantContext extends HRISContext {
  tenant: Tenant;
}

/**
 * Type helper for route handlers with full context
 */
export type RouteHandler<T = unknown> = (ctx: AuthenticatedContext & T) => Promise<unknown> | unknown;

/**
 * Type helper for public route handlers
 */
export type PublicRouteHandler<T = unknown> = (ctx: HRISContext & T) => Promise<unknown> | unknown;
