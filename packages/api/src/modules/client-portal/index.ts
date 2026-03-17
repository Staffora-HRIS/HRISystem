/**
 * Client Portal Module
 *
 * Customer-facing portal for staffora.co.uk.
 * Provides ticket management, document access, news, billing,
 * and user administration for tenant customers.
 *
 * Authentication is handled by BetterAuth (shared with HRIS).
 * Portal users are a subset of BetterAuth users with a portal_users profile record.
 */

export { clientPortalRoutes, type ClientPortalRoutes } from "./routes";
export {
  ClientPortalRepository,
  type TenantContext,
  type PaginationOptions,
} from "./repository";
export { ClientPortalService } from "./service";
export * from "./schemas";
