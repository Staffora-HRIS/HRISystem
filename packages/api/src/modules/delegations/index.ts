/**
 * Approval Delegation Module
 *
 * Provides delegation of approval authority from one user to another
 * for a specified time period and scope. Includes:
 * - CRUD operations on delegations
 * - Circular delegation detection
 * - Overlap validation
 * - Delegation usage logging
 * - Auto-expiry of past delegations
 */

// Export routes
export { delegationRoutes, type DelegationRoutes } from "./routes";

// Export service
export { DelegationService, DelegationErrorCodes } from "./service";

// Export repository
export {
  DelegationRepository,
  type TenantContext,
  type DelegationRow,
  type DelegationListRow,
  type ActiveDelegationRow,
  type DelegationLogRow,
} from "./repository";

// Export schemas
export * from "./schemas";
