/**
 * Client Portal Module
 *
 * Customer-facing portal for staffora.co.uk.
 * Provides ticket management, document access, news, billing,
 * and user administration for tenant customers.
 */

export { clientPortalRoutes, type ClientPortalRoutes } from "./routes";
export {
  ClientPortalRepository,
  type TenantContext,
  type PaginationOptions,
} from "./repository";
export { ClientPortalService } from "./service";
export * from "./schemas";
