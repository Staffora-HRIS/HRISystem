/**
 * Permission System Types
 *
 * Comprehensive type definitions for the 7-layer access control system.
 */

// =============================================================================
// Core Permission Types
// =============================================================================

/** Three-segment permission key: module:resource:action */
export type PermissionKey = string;

/** Permission effect */
export type PermissionEffect = "grant" | "deny" | "inherit";

/** Data sensitivity tiers */
export type SensitivityTier = 0 | 1 | 2 | 3 | 4;

export const SensitivityTierLabels: Record<SensitivityTier, string> = {
  0: "public",
  1: "internal",
  2: "restricted",
  3: "confidential",
  4: "privileged",
};

/** Data scope types */
export type DataScopeType =
  | "self"
  | "direct_reports"
  | "indirect_reports"
  | "department"
  | "division"
  | "location"
  | "cost_centre"
  | "legal_entity"
  | "all"
  | "custom";

/** Field permission levels */
export type FieldPermissionLevel = "edit" | "view" | "hidden";

// =============================================================================
// Role Types
// =============================================================================

/** System role slugs */
export type SystemRoleSlug =
  | "super_admin"
  | "tenant_admin"
  | "hr_admin"
  | "hr_officer"
  | "payroll_admin"
  | "recruitment_admin"
  | "lms_admin"
  | "compliance_officer"
  | "health_safety_officer"
  | "department_head"
  | "line_manager"
  | "team_leader"
  | "employee"
  | "contractor"
  | "temp_worker"
  | "intern"
  | "external_auditor"
  | "board_member";

/** Role categories */
export type RoleCategory =
  | "platform"
  | "hr"
  | "payroll"
  | "recruitment"
  | "lms"
  | "compliance"
  | "health_safety"
  | "management"
  | "employee"
  | "audit";

/** Portal types */
export type PortalType = "admin" | "manager" | "employee";

/** Role definition */
export interface RoleDefinition {
  id: string;
  tenantId: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Record<string, boolean>;
  portalType: PortalType | null;
  parentRoleId: string | null;
  roleCategory: RoleCategory;
  maxSensitivityTier: SensitivityTier;
  permissionCeiling: number;
  isTemplate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Role assignment with constraints (extended for permission system) */
export interface PermissionRoleAssignment {
  id: string;
  tenantId: string;
  userId: string;
  roleId: string;
  roleName: string;
  isSystem: boolean;
  constraints: RoleConstraints;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  assignedBy: string | null;
}

/** Role assignment constraints */
export interface RoleConstraints {
  scope?: DataScopeType;
  orgUnits?: string[];
  costCenters?: string[];
  customScopeId?: string;
  crossEntityAccess?: string[];
  crossEntityPermissions?: string[];
  reason?: string;
  originalHolder?: string;
  custom?: Record<string, unknown>;
}

// =============================================================================
// Effective Permission Types (resolved at runtime)
// =============================================================================

/** Single resolved permission */
export interface ResolvedPermission {
  key: PermissionKey;
  effect: PermissionEffect;
  /** Role names that contributed */
  sources: string[];
  dataScopes: DataScopeType[];
  /** Delegation ID if from delegation */
  viaDelegation?: string;
}

/** Full effective permissions for a user */
export interface EffectivePermissionsResponse {
  tenantId: string;
  userId: string;
  /** ISO date */
  computedAt: string;
  permissions: Record<PermissionKey, ResolvedPermission>;
  roles: string[];
  delegations: string[];
  dataScope: DataScopeType;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

/** Result of a permission check */
export interface PermissionCheckResult {
  allowed: boolean;
  requiresMfa: boolean;
  reason?: string;
  constraints?: RoleConstraints | null;
  sodViolation?: SoDViolation | null;
}

// =============================================================================
// Data Scope Types
// =============================================================================

/** Custom data scope definition */
export interface DataScope {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  scopeType: DataScopeType;
  filterCriteria: DataScopeFilter;
  isActive: boolean;
  createdAt: Date;
}

/** Filter criteria for custom scopes */
export interface DataScopeFilter {
  tags?: string[];
  employeeGroups?: string[];
  locations?: string[];
  departments?: string[];
  costCentres?: string[];
  legalEntities?: string[];
  employmentTypes?: string[];
  grades?: string[];
}

// =============================================================================
// Contextual Permission Types
// =============================================================================

/** Condition types */
export type ConditionType =
  | "time_window"
  | "workflow_state"
  | "employment_status"
  | "payroll_lock"
  | "review_cycle"
  | "probation_period"
  | "notice_period"
  | "custom";

/** Permission condition */
export interface PermissionCondition {
  id: string;
  tenantId: string | null;
  name: string;
  description: string | null;
  resource: string;
  action: string;
  conditionType: ConditionType;
  conditionParams: Record<string, unknown>;
  effect: "deny" | "require";
  isActive: boolean;
  priority: number;
}

// =============================================================================
// Approval Chain Types
// =============================================================================

/** Approval types */
export type ApprovalType =
  | "leave"
  | "expense"
  | "recruitment"
  | "payroll"
  | "contract_change"
  | "salary_change"
  | "data_erasure"
  | "headcount"
  | "custom";

/** Approver types */
export type ApproverType =
  | "direct_manager"
  | "skip_level_manager"
  | "department_head"
  | "specific_role"
  | "specific_user"
  | "cost_centre_owner"
  | "hr_business_partner"
  | "payroll_admin"
  | "pool";

/** Approval chain step */
export interface ApprovalChainStep {
  level: number;
  name: string;
  approverType: ApproverType;
  approverConfig: {
    roleSlug?: string;
    userId?: string;
    poolId?: string;
    fallbackRole?: string;
    allowDelegation?: boolean;
  };
  skipIf?: {
    condition: string;
    field: string;
    operator: "lt" | "lte" | "gt" | "gte" | "eq" | "neq" | "in";
    value: unknown;
  } | null;
  timeoutHours?: number;
}

/** Approval chain definition */
export interface ApprovalChainDefinition {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  approvalType: ApprovalType;
  steps: ApprovalChainStep[];
  isParallel: boolean;
  escalationHours: number;
  slaHours: number;
  maxLevels: number;
  isActive: boolean;
}

/** Approval instance status */
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "escalated"
  | "expired";

/** Step decision */
export type ApprovalDecision = "approved" | "rejected" | "skipped" | "escalated";

/** Approval instance */
export interface ApprovalInstance {
  id: string;
  tenantId: string;
  chainDefinitionId: string;
  entityType: string;
  entityId: string;
  submittedBy: string;
  submittedAt: Date;
  currentStep: number;
  status: ApprovalStatus;
  metadata: Record<string, unknown>;
  completedAt: Date | null;
}

/** Approval step decision */
export interface ApprovalStepDecision {
  id: string;
  tenantId: string;
  approvalInstanceId: string;
  stepNumber: number;
  stepName: string;
  assignedTo: string;
  decidedBy: string | null;
  delegationId: string | null;
  decision: ApprovalDecision | null;
  decisionAt: Date | null;
  comments: string | null;
  dueAt: Date | null;
  escalatedAt: Date | null;
  escalatedTo: string | null;
}

// =============================================================================
// Separation of Duties Types
// =============================================================================

/** SoD rule types */
export type SoDRuleType =
  | "self_approval"
  | "creator_approver"
  | "two_person"
  | "role_conflict";

/** SoD enforcement level */
export type SoDEnforcement = "block" | "warn" | "audit";

/** SoD violation */
export interface SoDViolation {
  ruleId: string;
  ruleName: string;
  violationType: SoDRuleType;
  enforcement: SoDEnforcement;
  details: string;
}

/** SoD rule */
export interface SoDRule {
  id: string;
  tenantId: string | null;
  name: string;
  description: string | null;
  ruleType: SoDRuleType;
  ruleParams: Record<string, unknown>;
  enforcement: SoDEnforcement;
  isActive: boolean;
}

// =============================================================================
// Delegation Types
// =============================================================================

/** Delegation scope */
export type DelegationScope =
  | "all"
  | "leave"
  | "expenses"
  | "time"
  | "purchase"
  | "recruitment"
  | "payroll";

/** Approval delegation */
export interface ApprovalDelegation {
  id: string;
  tenantId: string;
  delegatorId: string;
  delegateId: string;
  /** ISO date */
  startDate: string;
  /** ISO date */
  endDate: string;
  scope: DelegationScope;
  scopeFilters: Record<string, unknown>;
  notifyDelegator: boolean;
  includePending: boolean;
  delegationReason: string | null;
  isActive: boolean;
  maxAmount?: number;
  currency?: string;
  chainPrevention: boolean;
}

// =============================================================================
// Audit & Access Review Types
// =============================================================================

/** Permission change types */
export type PermissionChangeType =
  | "role_created"
  | "role_updated"
  | "role_deleted"
  | "role_archived"
  | "role_assigned"
  | "role_revoked"
  | "permission_granted"
  | "permission_revoked"
  | "field_permission_changed"
  | "delegation_created"
  | "delegation_revoked"
  | "delegation_used"
  | "delegation_expired"
  | "portal_access_granted"
  | "portal_access_revoked"
  | "data_scope_changed"
  | "condition_changed"
  | "sod_violation";

/** Security alert types */
export type SecurityAlertType =
  | "bulk_export"
  | "off_hours"
  | "escalation_attempt"
  | "failed_access"
  | "cross_tenant"
  | "sensitive_frequency"
  | "mass_record_access"
  | "api_key_abuse";

/** Security alert severity */
export type AlertSeverity = "low" | "medium" | "high" | "critical";

/** Security alert */
export interface SecurityAlert {
  id: string;
  tenantId: string;
  alertType: SecurityAlertType;
  severity: AlertSeverity;
  title: string;
  description: string | null;
  userId: string | null;
  ipAddress: string | null;
  details: Record<string, unknown>;
  status: "open" | "investigating" | "resolved" | "false_positive";
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  createdAt: Date;
}

/** Access review campaign */
export interface AccessReviewCampaign {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  reviewType: "quarterly" | "annual" | "ad_hoc" | "stale_permissions";
  status: "pending" | "active" | "completed" | "cancelled";
  startDate: string;
  dueDate: string;
  completedDate: string | null;
  scopeConfig: Record<string, unknown>;
  totalReviews: number;
  completedReviews: number;
  revocations: number;
}

/** Access review item */
export interface AccessReviewItem {
  id: string;
  tenantId: string;
  campaignId: string;
  targetUserId: string;
  reviewerId: string;
  roleAssignmentId: string | null;
  permissionKey: string | null;
  decision: "approve" | "revoke" | "modify" | "pending" | null;
  decisionNotes: string | null;
  decidedAt: Date | null;
  actionTaken: boolean;
}

// =============================================================================
// UI/Frontend Types
// =============================================================================

/** Permission gate props (for frontend component) */
export interface PermissionGateConfig {
  resource: string;
  action: string;
  showDisabled?: boolean;
  disabledTooltip?: string;
}

/** Field permission for form rendering */
export interface FieldPermissionEntry {
  entityName: string;
  fieldName: string;
  fieldLabel: string;
  fieldGroup: string | null;
  permission: FieldPermissionLevel;
  sensitivityTier: SensitivityTier;
  isSensitive: boolean;
}

/** Export control config */
export interface ExportControl {
  allowed: boolean;
  maxRecords?: number;
  excludeFields?: string[];
  requiresApproval?: boolean;
  auditLevel: "standard" | "detailed";
}

/** Permission simulation request */
export interface PermissionSimulationRequest {
  userId: string;
  addRoles?: string[];
  removeRoles?: string[];
  addDelegations?: Array<{ delegatorId: string; scope: DelegationScope }>;
}

/** Role comparison result */
export interface RoleComparison {
  roleA: { id: string; name: string };
  roleB: { id: string; name: string };
  onlyInA: PermissionKey[];
  onlyInB: PermissionKey[];
  inBoth: PermissionKey[];
  conflicts: Array<{
    key: PermissionKey;
    effectInA: PermissionEffect;
    effectInB: PermissionEffect;
  }>;
}

// =============================================================================
// Permission Module Constants
// =============================================================================

/** All permission modules */
export const PermissionModules = [
  "hr",
  "time",
  "absence",
  "payroll",
  "talent",
  "recruitment",
  "lms",
  "cases",
  "onboarding",
  "documents",
  "benefits",
  "compliance",
  "workflows",
  "analytics",
  "system",
  "health_safety",
  "equipment",
  "headcount",
] as const;

export type PermissionModule = (typeof PermissionModules)[number];
