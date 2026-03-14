/**
 * Contract Statements Module
 *
 * Provides the API layer for generating and managing UK Written Statements
 * of Employment Particulars (Employment Rights Act 1996 s.1-7B).
 *
 * Since 6 April 2020 all UK employees must receive a written statement
 * on or before their first day of work containing all 12 legally required
 * particulars.
 *
 * Usage:
 * ```typescript
 * import { contractStatementsRoutes } from './modules/contract-statements';
 *
 * const app = new Elysia()
 *   .use(contractStatementsRoutes);
 * ```
 */

// Export routes
export {
  contractStatementsRoutes,
  type ContractStatementsRoutes,
} from "./routes";

// Export service
export { ContractStatementsService } from "./service";

// Export repository
export {
  ContractStatementsRepository,
  type TenantContext,
  type PaginatedResult,
  type ContractStatementRow,
  type StatementListRow,
  type EmployeeDataRow,
  type ContractDataRow,
  type PositionDataRow,
  type CompensationDataRow,
  type AddressRow,
  type LeaveBalanceRow,
  type ComplianceEmployeeRow,
} from "./repository";

// Export schemas
export {
  // Enums
  StatementTypeSchema,
  // Content
  StatementContentSchema,
  // Request schemas
  GenerateStatementBodySchema,
  GenerateStatementSchema,
  IssueStatementSchema,
  AcknowledgeStatementSchema,
  // Response schemas
  ContractStatementResponseSchema,
  StatementListItemSchema,
  StatementListResponseSchema,
  ComplianceEmployeeItemSchema,
  ComplianceStatusResponseSchema,
  // Filters
  StatementFiltersSchema,
  AllStatementsFiltersSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type StatementType,
  type StatementContent,
  type GenerateStatementBody,
  type GenerateStatement,
  type IssueStatement,
  type AcknowledgeStatement,
  type ContractStatementResponse,
  type StatementListItem,
  type StatementListResponse,
  type ComplianceEmployeeItem,
  type ComplianceStatusResponse,
  type StatementFilters,
  type AllStatementsFilters,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
