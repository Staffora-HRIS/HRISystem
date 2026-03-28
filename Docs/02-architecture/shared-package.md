# @staffora/shared Package Reference

> Shared types, schemas, utilities, error codes, constants, and state machines used across the Staffora platform.
> *Last updated: 2026-03-28*

## Overview

The `@staffora/shared` package (`packages/shared/`) is the common dependency used by both `@staffora/api` and `@staffora/web`. It contains no runtime dependencies on Node.js server APIs (except `crypto` utilities) and provides a single source of truth for type definitions, validation schemas, business logic constants, and state machine definitions.

**Dependencies:** `@sinclair/typebox` (TypeBox schemas), `zod` (Zod schemas)

---

## Import Paths

| Path | Entry Point | Description |
|------|-------------|-------------|
| `@staffora/shared` | `src/index.ts` | Main entry -- re-exports everything from all sub-paths |
| `@staffora/shared/types` | `src/types/index.ts` | TypeScript type definitions for all modules |
| `@staffora/shared/constants` | `src/constants/index.ts` | HTTP status codes, pagination, cache TTLs, roles, audit events |
| `@staffora/shared/utils` | `src/utils/index.ts` | Date, validation, crypto, effective-dating, UK compliance utilities |
| `@staffora/shared/errors` | `src/errors/index.ts` | Error codes, messages, `AppError` class, factory functions |
| `@staffora/shared/schemas` | `src/schemas/index.ts` | TypeBox schemas for API request/response validation |
| `@staffora/shared/state-machines` | `src/state-machines/index.ts` | State machine definitions for 10 domain entities |

---

## Types (`@staffora/shared/types`)

### Common Types (`types/common.ts`)

Foundation types used across all modules.

| Export | Kind | Description |
|--------|------|-------------|
| `UUID` | Type alias | `string` -- UUID entity identifiers |
| `DateString` | Type alias | `string` -- ISO 8601 date (YYYY-MM-DD) |
| `TimestampString` | Type alias | `string` -- ISO 8601 timestamp |
| `PaginationParams` | Interface | `{ page?, pageSize? }` |
| `CursorPaginationParams` | Interface | `{ cursor?, limit?, direction? }` |
| `PaginatedResponse<T>` | Interface | Standard page-based response wrapper |
| `CursorPaginatedResponse<T>` | Interface | Cursor-based response wrapper |
| `SortDirection` | Type | `"asc" \| "desc"` |
| `SortParams<T>` | Interface | `{ sortBy?, sortDirection? }` |
| `MultiSortParams<T>` | Interface | Array of sort criteria |
| `ApiResponse<T>` | Interface | `{ success: true, data: T }` |
| `ApiError` | Interface | `{ success: false, error: { code, message, details?, fieldErrors?, requestId? } }` |
| `ApiResult<T>` | Type | `ApiResponse<T> \| ApiError` |
| `DateRange` | Interface | `{ effectiveFrom, effectiveTo }` |
| `EffectiveDated` | Interface | Mixin with `effectiveFrom` / `effectiveTo` |
| `BaseEntity` | Interface | `{ id, createdAt, updatedAt }` |
| `SoftDeletableEntity` | Interface | Extends `BaseEntity` with `deletedAt` |
| `TenantScopedEntity` | Interface | Extends `BaseEntity` with `tenantId` |
| `TenantScopedSoftDeletableEntity` | Interface | Both tenant-scoped and soft-deletable |
| `FilterOperator` | Type | `"eq" \| "neq" \| "gt" \| "gte" \| ... \| "isNotNull"` |
| `FilterCondition<T>` | Interface | `{ field, operator, value }` |
| `AuditMetadata` | Interface | `{ createdBy, updatedBy, deletedBy? }` |
| `LocalizedString` | Interface | `{ default, translations? }` |
| `Money` | Interface | `{ amount, currency }` (amount in smallest unit) |

### Authentication Types (`types/auth.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `UserStatus` | Type | `"active" \| "inactive" \| "pending" \| "locked" \| "suspended"` |
| `User` | Interface | User account entity (email, name, MFA status, etc.) |
| `UserCredentials` | Interface | `{ email, password }` |
| `SessionStatus` | Type | `"active" \| "expired" \| "revoked"` |
| `Session` | Interface | Authenticated session (token hashes, IP, device, MFA state) |
| `MfaMethod` | Type | `"totp" \| "sms" \| "email" \| "backup_codes"` |
| `MfaSetupResponse` | Interface | MFA setup response (secret, QR code, backup codes) |
| `MfaVerifyRequest` | Interface | `{ code, method, sessionId, rememberDevice? }` |
| `MfaVerifyResponse` | Interface | Verification result with tokens |
| `LoginRequest` | Interface | `{ email, password, tenantSlug?, rememberMe? }` |
| `LoginResponse` | Interface | Login result (tokens, user, MFA challenge, available tenants) |
| `RefreshTokenRequest` / `RefreshTokenResponse` | Interfaces | Token refresh flow |
| `PermissionResource` | Type | 18 resource types (employees, users, roles, tenants, etc.) |
| `PermissionAction` | Type | `"create" \| "read" \| "update" \| "delete" \| "manage" \| "approve" \| "export" \| "import"` |
| `Permission` | Interface | Permission definition with code, resource, action, module |
| `PermissionConstraint` | Interface | Row-level constraint (org_unit, cost_center, hierarchy, etc.) |
| `RoleStatus` | Type | `"active" \| "inactive"` |
| `Role` | Interface | Role with permission codes and default constraints |
| `RoleAssignment` | Interface | User-role link with effective dating and constraints |
| `PasswordPolicy` | Interface | Password policy configuration |
| `ApiKeyStatus` | Type | `"active" \| "revoked" \| "expired"` |
| `ApiKey` | Interface | API key for programmatic access |

### Better Auth Types (`types/better-auth.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `BetterAuthUser` | Interface | Better Auth user representation |
| `BetterAuthSession` | Interface | Better Auth session with tenant context |
| `SessionWithUser` | Interface | Combined session + user |
| `SignInRequest` / `SignInResponse` | Interfaces | Sign-in flow types |
| `SignUpRequest` / `SignUpResponse` | Interfaces | Sign-up flow types |
| `TwoFactorSetupResponse` | Interface | TOTP URI, secret, backup codes |
| `TwoFactorVerifyRequest` | Interface | `{ code }` |
| `AuthErrorResponse` | Interface | Auth error shape |

### Tenant Types (`types/tenant.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `TenantStatus` | Type | `"active" \| "suspended" \| "pending" \| "trial" \| "cancelled"` |
| `TenantTier` | Type | `"free" \| "starter" \| "professional" \| "enterprise"` |
| `Tenant` | Interface | Organization entity with settings, features, billing |
| `TenantSettings` | Interface | Timezone, date format, locale, working hours, branding |
| `TenantFeatures` | Interface | 17 boolean feature flags (MFA, SSO, modules, etc.) |
| `TenantBranding` | Interface | Primary/secondary colors, logos, custom CSS |
| `TenantNotificationSettings` | Interface | Email, in-app, push, SMS notification config |
| `TenantIntegrationSettings` | Interface | SSO and HRIS integration settings |
| `SsoConfiguration` | Interface | SAML/OIDC/Azure AD/Okta/Google SSO config |
| `TenantBilling` | Interface | Billing contact, address, tax ID, payment method |
| `TenantUserRole` | Type | `"owner" \| "admin" \| "member"` |
| `UserTenant` | Interface | User-tenant relationship |
| `TenantContext` | Interface | Request-scoped tenant context |
| `InvitationStatus` | Type | `"pending" \| "accepted" \| "expired" \| "revoked"` |
| `TenantInvitation` | Interface | Tenant invitation entity |

### Core HR Types (`types/hr.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `EmployeeStatus` | Type | `"pending" \| "active" \| "on_leave" \| "terminated"` |
| `EmploymentType` | Type | `"full_time" \| "part_time" \| "contract" \| "temporary" \| "intern"` |
| `Gender` | Type | 5 options |
| `MaritalStatus` | Type | 6 options |
| `Employee` | Interface | Core employee entity (number, status, hire date, job title, position, org unit, manager, FTE) |
| `EmployeePersonal` | Interface | Personal information (name, DOB, gender, nationality, disability status) |
| `EmployeeContact` | Interface | Contact information (phones, emergency contacts) |
| `AddressType` | Type | `"home" \| "mailing" \| "work" \| "other"` |
| `EmployeeAddress` | Interface | Employee address with effective dating |
| `IdentifierType` | Type | `"nino" \| "national_id" \| "passport" \| "drivers_license" \| ...` |
| `EmployeeIdentifier` | Interface | Sensitive identifiers (encrypted at rest) |
| `OrgUnitType` | Type | `"company" \| "division" \| "department" \| "team" \| "group" \| "other"` |
| `OrgUnit` | Interface | Organizational unit with hierarchy (effective-dated) |
| `Position` | Interface | Position definition with headcount, compensation range, SOC code |
| `CostCenter` | Interface | Financial allocation unit (effective-dated) |
| `ContractType` | Type | 6 contract types |
| `ContractStatus` | Type | 6 statuses |
| `EmploymentContract` | Interface | Employment contract entity |
| `AssignmentStatus` | Type | `"active" \| "inactive" \| "pending" \| "ended"` |
| `PositionAssignment` | Interface | Employee-position link (effective-dated) |
| `ReportingLine` | Interface | Manager relationship (direct/matrix/dotted, effective-dated) |
| `CompensationType` | Type | 7 types (base_salary, hourly_rate, bonus, etc.) |
| `PayFrequency` | Type | 6 frequencies |
| `CompensationChangeReason` | Type | 9 reasons |
| `CompensationHistory` | Interface | Compensation record (effective-dated) |
| `LocationType` | Type | 6 types |
| `Location` | Interface | Work location with geofence coordinates |
| `Job` | Interface | Job definition template |
| `EmployeeDocumentType` | Type | 10 document types |
| `EmployeeDocument` | Interface | Employee document entity |

### Time & Attendance Types (`types/time.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `TimeEventType` | Type | `"clock_in" \| "clock_out" \| "break_start" \| "break_end" \| "meal_start" \| "meal_end" \| "transfer"` |
| `TimeEventSource` | Type | `"device" \| "web" \| "mobile" \| "manager" \| "system" \| "import"` |
| `TimeEventStatus` | Type | `"pending" \| "approved" \| "rejected" \| "disputed" \| "auto_approved"` |
| `TimeDevice` | Interface | Physical or virtual clock device |
| `TimeEvent` | Interface | Individual clock event with GPS, photo, status |
| `ScheduleStatus` | Type | `"draft" \| "published" \| "archived"` |
| `Schedule` | Interface | Work schedule definition |
| `DayOfWeek` | Type | `"monday" \| ... \| "sunday"` |
| `Shift` | Interface | Shift definition (times, breaks, premium) |
| `ShiftAssignmentStatus` | Type | 6 statuses |
| `ShiftAssignment` | Interface | Employee-shift assignment |
| `TimesheetStatus` | Type | `"draft" \| "submitted" \| "pending_approval" \| "approved" \| "rejected" \| "paid"` |
| `TimeEntryType` | Type | 10 entry types (regular, overtime, holiday, PTO, etc.) |
| `Timesheet` | Interface | Pay period timesheet with hour totals |
| `TimesheetLine` | Interface | Daily time entry |
| `TimesheetApproval` | Interface | Approval record |
| `ScheduleTemplate` | Interface | Recurring schedule template |
| `OvertimeRule` | Interface | Overtime calculation rule |
| `ShiftSwapRequest` | Interface | Shift swap between employees |

### Absence Management Types (`types/absence.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `LeaveCategory` | Type | 12 categories (vacation, sick, parental, bereavement, etc.) |
| `LeaveUnit` | Type | `"days" \| "hours"` |
| `LeaveType` | Interface | Leave type definition (accrual, carryover, documentation rules) |
| `AccrualFrequency` | Type | 8 frequencies |
| `AccrualBasis` | Type | 4 bases (calendar_year, fiscal_year, hire_anniversary, continuous) |
| `LeavePolicy` | Interface | Leave policy with eligibility, entitlement, accrual rules, blackout periods |
| `LeaveAccrualRule` | Interface | Tiered accrual rule |
| `LeaveBalanceLedgerEntryType` | Type | 10 entry types (accrual, used, adjustment, carryover, etc.) |
| `LeaveBalance` | Interface | Current balance with YTD tracking |
| `LeaveBalanceLedgerEntry` | Interface | Audit trail entry |
| `LeaveRequestStatus` | Type | `"draft" \| "pending" \| "approved" \| "rejected" \| "cancelled" \| "withdrawn"` |
| `LeaveDurationType` | Type | `"full_day" \| "half_day_am" \| "half_day_pm" \| "hours"` |
| `LeaveRequest` | Interface | Leave request entity |
| `LeaveApproval` | Interface | Approval record |
| `PublicHoliday` | Interface | Public/company holiday |
| `LeaveCalendarEntry` | Interface | Calendar visualization entry |
| `LeaveEntitlementSummary` | Interface | Annual entitlement summary per employee |

### Workflow Types (`types/workflow.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `WorkflowStatus` | Type | `"draft" \| "active" \| "deprecated" \| "archived"` |
| `WorkflowTrigger` | Type | `"manual" \| "event" \| "schedule" \| "api" \| "record_change"` |
| `WorkflowCategory` | Type | 9 categories |
| `WorkflowDefinition` | Interface | Workflow blueprint with trigger, SLA config |
| `WorkflowVersion` | Interface | Immutable workflow version with steps and transitions |
| `WorkflowStepType` | Type | 12 step types (start, end, approval, task, notification, decision, etc.) |
| `WorkflowStep` | Interface | Step definition with config |
| `WorkflowStepConfig` | Interface | Step-specific configuration (assignees, notifications, conditions, scripts) |
| `WorkflowVariable` | Interface | Workflow variable definition |
| `WorkflowTransition` | Interface | Transition between steps |
| `WorkflowInstanceStatus` | Type | 7 statuses |
| `WorkflowInstance` | Interface | Running workflow instance |
| `WorkflowTaskStatus` | Type | 9 statuses |
| `WorkflowTask` | Interface | Work item with assignment, delegation, escalation |
| `WorkflowSLAConfig` | Interface | SLA configuration (target hours, actions, business hours) |
| `SLAAction` | Interface | SLA action (notify, escalate, reassign, auto_complete, terminate) |
| `WorkflowSLAEvent` | Interface | SLA event record |
| `WorkflowHistoryEvent` | Interface | Workflow audit trail |

### Talent Management Types (`types/talent.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `RequisitionStatus` | Type | 8 statuses |
| `Requisition` | Interface | Job requisition with compensation range, skills, interview stages |
| `InterviewStageConfig` | Interface | Interview stage configuration |
| `CandidateSource` | Type | 9 sources (direct_apply, referral, linkedin, agency, etc.) |
| `Candidate` | Interface | Candidate record with education, skills, ratings |
| `CandidateStageEvent` | Interface | Stage change audit event |
| `InterviewStatus` | Type | 5 statuses |
| `Interview` | Interface | Interview record |
| `InterviewRating` | Type | `1 \| 2 \| 3 \| 4 \| 5` |
| `InterviewRecommendation` | Type | `"strong_hire" \| "hire" \| "no_decision" \| "no_hire" \| "strong_no_hire"` |
| `InterviewFeedback` | Interface | Interviewer feedback with competency ratings |
| `OfferStatus` | Type | 9 statuses |
| `Offer` | Interface | Job offer with salary, bonus, equity, expiration |
| `PerformanceCycleStatus` | Type | `"draft" \| "active" \| "review" \| "calibration" \| "closed"` |
| `PerformanceCycle` | Interface | Performance cycle with deadlines and rating scale |
| `RatingScaleConfig` | Interface | Rating scale levels |
| `GoalStatus` / `GoalType` | Types | Goal status and type enums |
| `Goal` | Interface | Performance goal with key results and progress |
| `ReviewStatus` | Type | 8 review statuses |
| `Review` | Interface | Performance review (self-assessment, manager assessment, ratings) |
| `FeedbackType` / `FeedbackVisibility` | Types | Feedback enums |
| `FeedbackItem` | Interface | Continuous feedback item |
| `DevelopmentPlanStatus` | Type | 4 statuses |
| `DevelopmentPlan` | Interface | Individual development plan with activities |

### LMS Types (`types/lms.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `CourseStatus` / `CourseFormat` / `ContentType` | Types | Course enums |
| `Course` | Interface | Course definition (format, duration, prerequisites, certificate, ratings) |
| `CourseModule` | Interface | Course section with content items |
| `ContentItem` | Interface | Content item (video, document, SCORM, quiz, etc.) |
| `AssessmentType` / `QuestionType` | Types | Assessment enums |
| `Assessment` | Interface | Assessment with questions and scoring |
| `AssessmentQuestion` | Interface | Question (multiple choice, true/false, matching, etc.) |
| `LearningPathStatus` | Type | 3 statuses |
| `LearningPath` | Interface | Learning path (curriculum) with items |
| `LearningPathItem` | Interface | Path item (course, assessment, external, milestone) |
| `LearningAssignmentStatus` | Type | 7 statuses |
| `AssignmentSource` | Type | 6 sources |
| `PathAssignment` / `CourseAssignment` | Interfaces | Assignment tracking |
| `Completion` | Interface | Course completion record |
| `Certificate` | Interface | Learning certificate with verification code |
| `SkillCategory` / `ProficiencyLevel` | Types | Skill enums |
| `Skill` | Interface | Skill definition |
| `EmployeeSkill` | Interface | Employee skill record with proficiency and endorsements |
| `CourseRating` | Interface | Course rating/review |
| `LearningCatalog` | Interface | Learning catalog for organizing content |

### Case Management Types (`types/cases.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `CaseTypeCategory` | Type | 11 categories (hr_inquiry, compliance, grievance, etc.) |
| `CaseType` | Interface | Case type with SLA config, custom fields, status transitions |
| `CaseCustomField` | Interface | Custom field definition |
| `CaseStatus` | Type | 9 statuses (new, open, in_progress, pending_info, escalated, etc.) |
| `CasePriority` | Type | `"low" \| "medium" \| "high" \| "critical"` |
| `Case` | Interface | HR case entity with participants, SLA tracking, satisfaction |
| `CaseParticipant` | Interface | Case participant with role and notification preferences |
| `CaseComment` | Interface | Case comment (public/internal/private visibility) |
| `CaseAttachment` | Interface | File attachment with virus scan status |
| `CaseStatusHistory` | Interface | Status change audit trail |
| `CaseSLAConfig` | Interface | SLA configuration per priority level |
| `CaseSLAEvent` | Interface | SLA event tracking |
| `CaseTemplate` | Interface | Response template |
| `CaseQueue` | Interface | Case routing queue with assignment strategy |
| `CaseMetrics` | Interface | Case metrics summary |

### Onboarding Types (`types/onboarding.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `OnboardingPlanStatus` / `OnboardingPlanType` | Types | Plan enums |
| `OnboardingPlan` | Interface | Onboarding plan template with tasks and milestones |
| `OnboardingPlanTask` | Interface | Task template (assignee type, dependencies, notifications) |
| `OnboardingTaskCategory` | Type | 8 categories (paperwork, training, it_setup, etc.) |
| `OnboardingTaskType` | Type | 8 types (manual, form, document_sign, course, etc.) |
| `OnboardingMilestone` | Interface | Milestone definition |
| `OnboardingInstanceStatus` | Type | 6 statuses |
| `OnboardingInstance` | Interface | Employee onboarding instance with progress tracking |
| `OnboardingTaskStatus` | Type | 7 statuses |
| `OnboardingTask` | Interface | Task instance with status and verification |
| `OnboardingTaskEvent` | Interface | Task event history |
| `ProvisioningConnectorType` / `ProvisioningConnectorStatus` | Types | Connector enums |
| `ProvisioningConnector` | Interface | Automated account creation connector |
| `ProvisioningRequest` | Interface | Provisioning request with retry logic |
| `OnboardingAnalytics` | Interface | Onboarding analytics summary |
| `OnboardingSurvey` | Interface | Onboarding survey response |

### Reporting Types (`types/reporting.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `ReportDefinition` | Interface | Report definition (data sources, columns, filters, charts, schedule) |
| `ReportDataSource` | Interface | Data source configuration with joins |
| `ReportColumn` | Interface | Column definition with data type, formatting, drill-down |
| `ReportFilter` / `ReportSort` / `ReportGrouping` | Interfaces | Report configuration |
| `AggregationFunction` | Type | `"sum" \| "avg" \| "min" \| "max" \| "count" \| "count_distinct" \| "median" \| "std_dev"` |
| `ReportChartConfig` | Interface | Chart configuration (10 chart types) |
| `ReportSchedule` | Interface | Scheduled report delivery |
| `ReportParameter` | Interface | Report parameter/prompt |
| `MetricDefinition` | Interface | KPI/metric definition with thresholds |
| `ExportFormat` | Type | `"csv" \| "xlsx" \| "pdf" \| "json" \| "xml"` |
| `ReportExport` | Interface | Export request tracking |
| `DashboardCache` | Interface | Dashboard cache entry |
| `Dashboard` | Interface | Dashboard definition with widgets |
| `DashboardWidget` | Interface | Dashboard widget (metric, chart, table, text, embedded) |

### Analytics Types (`types/analytics.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `PAModelType` | Type | 9 model types (attrition_risk, flight_risk, skill_gap, etc.) |
| `PAModel` | Interface | Predictive analytics model with features, training config, fairness constraints |
| `PAModelMetrics` | Interface | Model performance metrics (accuracy, precision, recall, AUC, etc.) |
| `PAFeatureDefinition` | Interface | Feature definition with transformation and missing value strategy |
| `PADataset` | Interface | Dataset for training/prediction |
| `PADatasetStatistics` | Interface | Column-level statistics |
| `PARefreshJob` | Interface | Analytics refresh job |
| `PAInsight` | Interface | Analytics insight/recommendation |
| `CohortQueryParams` / `CohortQueryResult` | Interfaces | Cohort analysis types |
| `PAPrediction` | Interface | Individual prediction with SHAP feature contributions |

### Payroll Types (`types/payroll.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `TaxCodeSource` | Type | `"hmrc" \| "manual" \| "p45" \| "p46" \| "starter_declaration"` |
| `TaxBasis` | Type | `"cumulative" \| "week1_month1"` |
| `EmployeeTaxCode` | Interface | UK HMRC tax code assignment (effective-dated) |
| `UK_TAX_CODE_PATTERN` | Const | RegExp for validating UK tax code formats |
| `TAX_CODE_SUFFIX_LETTERS` | Const | Valid suffix letters (L, M, N, T, P, K, Y) |
| `FIXED_RATE_TAX_CODES` | Const | Fixed-rate codes (BR, D0, D1, D2, NT, 0T) |
| `TAX_CODE_PREFIXES` | Const | Country prefixes (S for Scotland, C for Wales) |
| `PayrollRunStatus` | Type | 6 statuses (draft through paid) |
| `PayrollRunType` | Type | `"monthly" \| "weekly" \| "supplemental"` |
| `StudentLoanPlan` | Type | `"none" \| "plan1" \| "plan2" \| "plan4" \| "plan5" \| "postgrad"` |
| `PaymentMethod` | Type | `"bacs" \| "faster_payments" \| "cheque" \| "cash"` |
| `NI_CATEGORIES` | Const | HMRC National Insurance category letters (A-Z, 12 categories) |
| `NICategory` | Type | NI category type |

### Permission System Types (`types/permissions.ts`)

7-layer access control system types.

| Export | Kind | Description |
|--------|------|-------------|
| `PermissionKey` | Type | Three-segment key: `module:resource:action` |
| `PermissionEffect` | Type | `"grant" \| "deny" \| "inherit"` |
| `SensitivityTier` | Type | `0 \| 1 \| 2 \| 3 \| 4` (public to privileged) |
| `SensitivityTierLabels` | Const | Tier labels map |
| `DataScopeType` | Type | 10 scope types (self, direct_reports, department, all, custom, etc.) |
| `FieldPermissionLevel` | Type | `"edit" \| "view" \| "hidden"` |
| `SystemRoleSlug` | Type | 18 system role slugs |
| `RoleCategory` | Type | 10 role categories |
| `PortalType` | Type | `"admin" \| "manager" \| "employee"` |
| `RoleDefinition` | Interface | Role with permissions, sensitivity tier, permission ceiling |
| `PermissionRoleAssignment` | Interface | Role assignment with constraints |
| `RoleConstraints` | Interface | Scope, org units, cost centers, custom scope |
| `ResolvedPermission` | Interface | Runtime-resolved permission with sources and data scopes |
| `EffectivePermissionsResponse` | Interface | Full effective permissions for a user |
| `PermissionCheckResult` | Interface | Permission check result with SoD violation |
| `DataScope` / `DataScopeFilter` | Interfaces | Custom data scope definitions |
| `ConditionType` | Type | 8 contextual condition types |
| `PermissionCondition` | Interface | Conditional permission |
| `ApprovalType` | Type | 9 approval types |
| `ApprovalChainStep` / `ApprovalChainDefinition` | Interfaces | Approval chain configuration |
| `ApprovalInstance` / `ApprovalStepDecision` | Interfaces | Approval instance tracking |
| `SoDRuleType` / `SoDEnforcement` | Types | Separation of Duties enums |
| `SoDViolation` / `SoDRule` | Interfaces | SoD violation and rule definitions |
| `DelegationScope` | Type | 7 delegation scopes |
| `ApprovalDelegation` | Interface | Approval delegation with amount limits |
| `PermissionChangeType` | Type | 17 change types for audit |
| `SecurityAlertType` / `AlertSeverity` | Types | Security alert enums |
| `SecurityAlert` | Interface | Security alert entity |
| `AccessReviewCampaign` / `AccessReviewItem` | Interfaces | Periodic access review |
| `PermissionGateConfig` | Interface | Frontend permission gate props |
| `FieldPermissionEntry` | Interface | Field-level permission for form rendering |
| `ExportControl` | Interface | Export control configuration |
| `PermissionSimulationRequest` | Interface | What-if permission simulation |
| `RoleComparison` | Interface | Role diff comparison |
| `PermissionModules` | Const | Array of 18 permission module names |
| `PermissionModule` | Type | Permission module type |

---

## Constants (`@staffora/shared/constants`)

All constants are exported from `src/constants/index.ts`.

### `HttpStatus`

Standard HTTP status codes as a const object.

```typescript
HttpStatus.OK           // 200
HttpStatus.CREATED      // 201
HttpStatus.BAD_REQUEST  // 400
HttpStatus.UNAUTHORIZED // 401
HttpStatus.FORBIDDEN    // 403
HttpStatus.NOT_FOUND    // 404
HttpStatus.CONFLICT     // 409
HttpStatus.TOO_MANY_REQUESTS       // 429
HttpStatus.INTERNAL_SERVER_ERROR    // 500
```

### `PaginationDefaults`

| Key | Value | Description |
|-----|-------|-------------|
| `PAGE` | 1 | Default page number |
| `PAGE_SIZE` | 20 | Default items per page |
| `MAX_PAGE_SIZE` | 100 | Maximum items per page |

### `CacheTTL`

Cache durations in seconds.

| Key | Value | Description |
|-----|-------|-------------|
| `PERMISSIONS` | 900 | 15 minutes |
| `SESSION` | 86400 | 24 hours |
| `TENANT_SETTINGS` | 3600 | 1 hour |
| `USER_PROFILE` | 300 | 5 minutes |
| `ROLES` | 1800 | 30 minutes |
| `SHORT` | 60 | 1 minute |
| `MEDIUM` | 600 | 10 minutes |
| `LONG` | 3600 | 1 hour |

### `RateLimits`

Requests per minute by endpoint category.

| Key | Value | Description |
|-----|-------|-------------|
| `DEFAULT` | 100 | Standard API endpoints |
| `AUTH` | 20 | Authentication endpoints |
| `SEARCH` | 60 | Search endpoints |
| `REPORTS` | 10 | Report generation |
| `UPLOADS` | 20 | File uploads |

### `SessionConfig`

| Key | Value | Description |
|-----|-------|-------------|
| `COOKIE_NAME` | `"staffora_session"` | Session cookie name |
| `DURATION` | 86,400,000 ms | 24 hours |
| `REMEMBER_ME_DURATION` | 2,592,000,000 ms | 30 days |
| `IDLE_TIMEOUT` | 1,800,000 ms | 30 minutes |

### `ValidationLimits`

| Key | Value | Description |
|-----|-------|-------------|
| `EMAIL_MAX` | 255 | Maximum email length |
| `NAME_MAX` | 100 | Maximum name length |
| `PASSWORD_MIN` | 12 | Minimum password length |
| `PASSWORD_MAX` | 128 | Maximum password length |
| `DESCRIPTION_MAX` | 1000 | Maximum description length |
| `NOTES_MAX` | 5000 | Maximum notes length |
| `SLUG_MIN` / `SLUG_MAX` | 3 / 50 | Slug length bounds |
| `FILE_SIZE_MAX` | 10,485,760 | 10 MB file upload limit |

### `DateFormats`

| Key | Value |
|-----|-------|
| `ISO` | `"yyyy-MM-dd'T'HH:mm:ss.SSSxxx"` |
| `DATE` | `"yyyy-MM-dd"` |
| `TIME` | `"HH:mm:ss"` |
| `DISPLAY_DATE` | `"MMM dd, yyyy"` |
| `DISPLAY_DATETIME` | `"MMM dd, yyyy HH:mm"` |

### `SystemRoles`

18 system roles: `SUPER_ADMIN`, `TENANT_ADMIN`, `HR_ADMIN`, `HR_OFFICER`, `PAYROLL_ADMIN`, `RECRUITMENT_ADMIN`, `LMS_ADMIN`, `COMPLIANCE_OFFICER`, `HEALTH_SAFETY_OFFICER`, `DEPARTMENT_HEAD`, `LINE_MANAGER`, `MANAGER` (alias), `TEAM_LEADER`, `EMPLOYEE`, `CONTRACTOR`, `TEMP_WORKER`, `INTERN`, `EXTERNAL_AUDITOR`, `BOARD_MEMBER`.

Type: `SystemRole`

### `AuditEventTypes`

Audit event type constants organized by domain: auth events (login, logout, MFA), user events (CRUD, status), employee events (created, updated, terminated), role events (assigned, revoked, CRUD), tenant events (created, updated, suspended, activated).

Type: `AuditEventType`

---

## Utilities (`@staffora/shared/utils`)

### Date Utilities (`utils/dates.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `formatDate` | `(date: Date) => DateString` | Format to YYYY-MM-DD |
| `formatTimestamp` | `(date: Date) => string` | Format to ISO timestamp |
| `formatDatePattern` | `(date: Date, pattern: string) => string` | Custom format (YYYY, MM, DD, HH, mm, ss) |
| `parseDate` | `(dateString: string) => Date \| null` | Safe parse |
| `parseDateStrict` | `(dateString: string) => Date` | Parse or throw |
| `isDateInRange` | `(date, startDate, endDate) => boolean` | Inclusive range check |
| `doDateRangesOverlap` | `(range1: DateRange, range2: DateRange) => boolean` | Check range overlap |
| `isToday` | `(date) => boolean` | Check if today |
| `isPast` / `isFuture` | `(date) => boolean` | Past/future check |
| `getEffectiveRecord` | `<T>(records: T[], asOfDate?) => T \| null` | Get currently effective record |
| `getEffectiveRecordsInRange` | `<T>(records, start, end) => T[]` | Get all records effective in range |
| `addDays` / `addWeeks` / `addMonths` / `addYears` | `(date, n) => Date` | Date arithmetic |
| `startOfDay` / `endOfDay` | `(date) => Date` | Day boundaries |
| `startOfMonth` / `endOfMonth` | `(date) => Date` | Month boundaries |
| `startOfYear` / `endOfYear` | `(date) => Date` | Year boundaries |
| `startOfWeek` | `(date, weekStartsOn?) => Date` | Week boundary (default Monday) |
| `diffInDays` / `diffInMonths` / `diffInYears` | `(date1, date2) => number` | Duration calculations |
| `isWeekend` | `(date) => boolean` | Weekend check |
| `addBusinessDays` | `(date, days) => Date` | Skip weekends |
| `countBusinessDays` | `(start, end) => number` | Count weekdays |

### Validation Utilities (`utils/validation.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `isValidEmail` | `(email: string) => boolean` | RFC 5322 email validation |
| `isValidUUID` | `(uuid: string) => boolean` | Any UUID version |
| `isValidUUIDv4` | `(uuid: string) => boolean` | UUID v4 specifically |
| `isStrongPassword` | `(password, options?) => PasswordValidationResult` | Password strength (result: `{ isValid, errors, strength }`) |
| `sanitizeString` | `(input: string) => string` | Remove dangerous characters |
| `escapeHtml` / `unescapeHtml` | `(input: string) => string` | XSS prevention |
| `isValidUrl` | `(url, options?) => boolean` | URL validation |
| `isValidPhone` | `(phone: string) => boolean` | International phone format |
| `isValidSlug` | `(slug: string) => boolean` | URL slug validation |
| `isValidEmployeeNumber` | `(empNumber, pattern?) => boolean` | Employee number format |
| `isValidNINO` | `(nino: string) => boolean` | UK National Insurance Number (HMRC rules) |
| `isValidUKPostcode` | `(postcode: string) => boolean` | UK Royal Mail postcode format |
| `truncate` | `(input, maxLength, suffix?) => string` | String truncation |

### Effective Dating Utilities (`utils/effective-dating.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `EffectiveDateRange` | Interface | `{ effectiveFrom, effectiveTo }` |
| `EffectiveDatedRecord` | Interface | Extends range with `id` |
| `OverlapValidationResult` | Interface | `{ valid, overlappingRecords, errorMessage }` |
| `EffectiveDatingDimension` | Type | `"personal" \| "contract" \| "position" \| "compensation" \| "manager" \| "status" \| "custom"` |
| `rangesOverlap` | Function | Check if two date ranges overlap |
| `validateNoOverlap` | Function | Validate no overlap with existing records (primary validation function) |
| `dateInRange` | Function | Check if date falls within range |
| `findEffectiveRecord` | Function | Find the record effective on a given date |
| `findCurrentRecord` | Function | Find the open-ended (current) record |
| `calculateEndDate` | Function | Calculate the day before a new record starts |
| `isValidEffectiveDateRange` | Function | Validate from <= to |
| `sortByEffectiveDate` | Function | Sort records by effective date |
| `validateNoOverlapAsync` | Function | Async version that fetches records first |
| `EffectiveDateOverlapError` | Class | Error class (code: `EFFECTIVE_DATE_OVERLAP`) |
| `InvalidEffectiveDateRangeError` | Class | Error class (code: `INVALID_DATE_RANGE`) |

### Crypto Utilities (`utils/crypto.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `generateId` | `() => string` | Generate UUID v4 |
| `generateShortId` | `(length?) => string` | URL-safe short ID (default 12 chars) |
| `generateNumericCode` | `(length?) => string` | Numeric code for MFA (default 6 digits) |
| `generateToken` | `(byteLength?) => string` | Hex-encoded secure token |
| `generateUrlSafeToken` | `(byteLength?) => string` | URL-safe base64 token |
| `hashString` | `(input) => string` | SHA-256 hash |
| `hashStringSHA512` | `(input) => string` | SHA-512 hash |
| `hashMD5` | `(input) => string` | MD5 hash (checksums only) |
| `hashPassword` | `(password, config?) => string` | PBKDF2 password hash (`iterations:salt:hash`) |
| `verifyPassword` | `(password, storedHash) => boolean` | Timing-safe PBKDF2 verification |
| `verifyHash` | `(input, hash) => boolean` | Timing-safe SHA-256 verification |
| `generateTimedToken` / `verifyTimedToken` | Functions | Time-limited tokens with embedded expiration |
| `calculateChecksum` / `verifyChecksum` | Functions | Data integrity checksums |
| `toBase64` / `fromBase64` | Functions | Base64 encoding/decoding |
| `toBase64Url` / `fromBase64Url` | Functions | URL-safe base64 encoding/decoding |

### Bradford Factor (`utils/bradford-factor.ts`)

UK absence monitoring metric: **B = S^2 x D** (S = spells, D = total days).

| Export | Kind | Description |
|--------|------|-------------|
| `AbsenceSpell` | Interface | `{ startDate, endDate }` |
| `BradfordFactorResult` | Interface | `{ score, spells, totalDays, level, periodStart, periodEnd }` |
| `BradfordThresholds` | Interface | `{ low: 50, moderate: 125, high: 400, serious: 650 }` |
| `DEFAULT_THRESHOLDS` | Const | UK standard thresholds |
| `calculateBradfordFactor` | Function | Calculate Bradford Factor for rolling period |
| `getBradfordLevelDescription` | Function | Human-readable level description |

### Holiday Pay (`utils/holiday-pay.ts`)

UK Employment Rights Act 1996, 52-week reference period calculator.

| Export | Kind | Description |
|--------|------|-------------|
| `REFERENCE_WEEKS` | Const | 52 |
| `MAX_LOOKBACK_WEEKS` | Const | 104 |
| `STANDARD_DAYS_PER_WEEK` | Const | 5 |
| `WeeklyPayRecord` | Interface | Simple gross-pay weekly record |
| `HolidayPayResult` | Interface | `{ weeklyRate, dailyRate, weeksUsed, referenceStartDate, referenceEndDate }` |
| `calculateHolidayPay` | Function | Simple gross-pay model |
| `WeeklyEarnings` | Interface | Itemised earnings breakdown (basic, overtime, commission, bonus) |
| `HolidayDayRateBreakdown` | Interface | Per-component average breakdown |
| `HolidayDayRateResult` | Interface | Itemised calculation result |
| `calculateHolidayDayRate` | Function | Itemised earnings model for payroll |

### Statutory Notice (`utils/statutory-notice.ts`)

UK Employment Rights Act 1996, Section 86 -- minimum notice periods.

| Export | Kind | Description |
|--------|------|-------------|
| `StatutoryNoticeInput` | Interface | `{ hireDate, referenceDate?, contractualNoticeDays? }` |
| `StatutoryNoticeResult` | Interface | Years of service, statutory weeks, compliance status |
| `calculateStatutoryNoticePeriod` | Function | Calculate statutory minimum notice and compliance |

### String Utilities (inline in `utils/index.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `slugify` | `(text: string) => string` | Generate URL-safe slug |
| `capitalize` | `(text: string) => string` | Capitalize first letter |
| `toTitleCase` | `(text: string) => string` | Title case string |

### ID Utilities (inline in `utils/index.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `generatePrefixedId` | `(prefix: string, length?) => string` | Prefixed ID (e.g., `emp_abc123xyz789`) |

### Object Utilities (inline in `utils/index.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `deepClone` | `<T>(obj: T) => T` | JSON deep clone |
| `isEmpty` | `(obj) => boolean` | Check if object has no keys |
| `pick` | `<T, K>(obj, keys) => Pick<T, K>` | Pick keys from object |
| `omit` | `<T, K>(obj, keys) => Omit<T, K>` | Omit keys from object |

### Array Utilities (inline in `utils/index.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `unique` | `<T>(array: T[]) => T[]` | Deduplicate array |
| `groupBy` | `<T>(array, key) => Record<string, T[]>` | Group by key |
| `chunk` | `<T>(array, size) => T[][]` | Split into chunks |
| `flatten` | `<T>(array) => T[]` | Flatten nested arrays |
| `sortBy` | `<T>(array, key, direction?) => T[]` | Sort by key |

### Async Utilities (inline in `utils/index.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `sleep` | `(ms: number) => Promise<void>` | Delay execution |
| `retry` | `<T>(fn, options?) => Promise<T>` | Retry with exponential backoff |
| `parallelLimit` | `<T, R>(items, fn, limit) => Promise<R[]>` | Concurrency-limited parallel execution |

### Type Guard Utilities (inline in `utils/index.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `isDefined` | `<T>(value) => value is T` | Not null/undefined |
| `isNonEmptyString` | `(value) => value is string` | Non-empty string check |
| `isNonEmptyArray` | `<T>(value) => value is T[]` | Non-empty array check |

---

## Error Codes (`@staffora/shared/errors`)

### Error Code Constants

Error codes are organized by module, each as a `const` object. All are merged into `ErrorCodes`.

| Object | Codes | Examples |
|--------|:-----:|---------|
| `GenericErrorCodes` | 7 | `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `UNAUTHORIZED`, `CONFLICT`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE` |
| `AuthErrorCodes` | 6 | `INVALID_CREDENTIALS`, `SESSION_EXPIRED`, `MFA_REQUIRED`, `MFA_INVALID`, `ACCOUNT_LOCKED`, `ACCOUNT_SUSPENDED` |
| `TenantErrorCodes` | 3 | `TENANT_NOT_FOUND`, `TENANT_SUSPENDED`, `TENANT_ACCESS_DENIED` |
| `HRErrorCodes` | 7 | `EFFECTIVE_DATE_OVERLAP`, `INVALID_LIFECYCLE_TRANSITION`, `POSITION_ALREADY_FILLED`, `EMPLOYEE_NOT_FOUND`, `ORG_UNIT_HAS_CHILDREN`, `CIRCULAR_REPORTING_LINE` |
| `TimeErrorCodes` | 4 | `TIMESHEET_ALREADY_APPROVED`, `CLOCK_EVENT_OUT_OF_SEQUENCE`, `INVALID_TIME_ENTRY`, `SCHEDULE_CONFLICT` |
| `AbsenceErrorCodes` | 4 | `INSUFFICIENT_LEAVE_BALANCE`, `BLACKOUT_PERIOD_VIOLATION`, `LEAVE_REQUEST_OVERLAP`, `POLICY_NOT_FOUND` |
| `WorkflowErrorCodes` | 3 | `INVALID_WORKFLOW_TRANSITION`, `TASK_ALREADY_COMPLETED`, `WORKFLOW_NOT_FOUND` |
| `TalentErrorCodes` | 3 | `REQUISITION_CLOSED`, `CANDIDATE_ALREADY_EXISTS`, `OFFER_EXPIRED` |
| `LMSErrorCodes` | 3 | `COURSE_NOT_FOUND`, `PREREQUISITE_NOT_MET`, `ASSIGNMENT_ALREADY_COMPLETED` |
| `CaseErrorCodes` | 2 | `CASE_CLOSED`, `RESTRICTED_ACCESS` |
| `PayrollErrorCodes` | 3 | `INVALID_TAX_CODE_FORMAT`, `NO_CURRENT_TAX_CODE`, `INVALID_PAYROLL_TRANSITION` |
| `DocumentsErrorCodes` | 1 | `VIRUS_DETECTED` |

**Types:** `ErrorCode` (union of all codes), plus per-module types (`AuthErrorCode`, `HRErrorCode`, etc.)

### Error Messages

`ErrorMessages` maps every `ErrorCode` to a user-friendly message string.

`getErrorMessage(code)` returns the message for a code, or a generic fallback.

### Error Classes and Factories

| Export | Kind | Description |
|--------|------|-------------|
| `ErrorDetails` | Interface | Standard error detail structure (`code`, `message`, `details?`, `fieldErrors?`, `requestId?`, `statusCode?`) |
| `AppError` | Class | Application error with code, statusCode, details, fieldErrors, isOperational. Has `toJSON()` for API responses. |
| `createError` | Function | Factory: `createError(code, { message?, statusCode?, details?, fieldErrors?, cause? })` |
| `createValidationError` | Function | Factory for 400 validation errors with field-level details |
| `createNotFoundError` | Function | Factory for 404 errors: `createNotFoundError("Employee", "emp_123")` |
| `createForbiddenError` | Function | Factory for 403 errors: `createForbiddenError("delete", "employee")` |
| `createUnauthorizedError` | Function | Factory for 401 errors |
| `createConflictError` | Function | Factory for 409 errors |
| `isAppError` | Function | Type guard for `AppError` |
| `isOperationalError` | Function | Check if error is operational (expected) vs programming error |

---

## Schemas (`@staffora/shared/schemas`)

TypeBox schemas for API request/response validation.

### Base Schemas

| Schema | TypeBox Type | Description |
|--------|-------------|-------------|
| `UUIDSchema` | `Type.String({ format: "uuid" })` | UUID format validation |
| `DateSchema` | `Type.String({ format: "date" })` | YYYY-MM-DD date |
| `TimestampSchema` | `Type.String({ format: "date-time" })` | ISO 8601 timestamp |
| `EmailSchema` | `Type.String({ format: "email" })` | Email with max 255 chars |
| `UrlSchema` | `Type.String({ format: "uri" })` | Valid URL |

### Pagination Schemas

| Schema | Description |
|--------|-------------|
| `PaginationSchema` | `{ page?, pageSize? }` (page-based) |
| `CursorPaginationSchema` | `{ cursor?, limit?, direction? }` (cursor-based) |
| `PaginationMetaSchema` | Response metadata (page, pageSize, totalItems, totalPages, hasNextPage, hasPreviousPage) |

### Sort Schemas

| Schema | Description |
|--------|-------------|
| `SortDirectionSchema` | `"asc" \| "desc"` |
| `SortSchema` | `{ sortBy?, sortDirection? }` |

### Response Schemas

| Schema/Function | Description |
|-----------------|-------------|
| `createPaginatedResponseSchema(itemSchema)` | Wrap item schema in paginated response |
| `createSingleResponseSchema(itemSchema)` | Wrap item schema in `{ success: true, data }` |
| `ApiErrorSchema` | Error response: `{ success: false, error: { code, message, details?, fieldErrors?, requestId? } }` |

### Entity Schemas

| Schema | Description |
|--------|-------------|
| `DateRangeSchema` | `{ effectiveFrom, effectiveTo }` for effective dating |
| `BaseEntitySchema` | `{ id, createdAt, updatedAt }` |
| `TenantScopedEntitySchema` | `{ id, tenantId, createdAt, updatedAt }` |
| `MoneySchema` | `{ amount (integer, smallest unit), currency (ISO 4217) }` |
| `EmployeeStatusSchema` | `"pending" \| "active" \| "on_leave" \| "terminated"` |

### Auth Schemas

| Schema | Description |
|--------|-------------|
| `LoginRequestSchema` | `{ email, password, tenantSlug?, rememberMe? }` |
| `MfaVerifyRequestSchema` | `{ code, method, sessionId, rememberDevice? }` |

### Query/Filter Schemas

| Schema | Description |
|--------|-------------|
| `IdParamSchema` | `{ id: UUID }` -- standard path parameter |
| `SearchQuerySchema` | `{ q?: string }` -- search query |
| `DateFilterSchema` | `{ startDate?, endDate? }` |

### Bulk Operation Schemas

| Schema | Description |
|--------|-------------|
| `BulkIdsSchema` | `{ ids: UUID[] }` (1-100 items) |
| `BulkResultSchema` | `{ success: UUID[], failed: [{ id, error }], totalProcessed, totalSuccess, totalFailed }` |

### File Schema

| Schema | Description |
|--------|-------------|
| `FileMetadataSchema` | `{ fileName, fileSize, mimeType, url? }` |

Each schema has a corresponding `Static<typeof Schema>` type export (e.g., `UUIDSchemaType`, `PaginationSchemaType`).

---

## State Machines (`@staffora/shared/state-machines`)

10 state machines defining valid states and transitions for domain entities. Each state machine exports:
- **States** constant object (e.g., `EmployeeStates`)
- **State type** (e.g., `EmployeeState`)
- **Transition functions**: `canTransition(from, to)`, `getValidTransitions(from)`, `validateTransition(from, to)` (throws on invalid)
- **Metadata functions**: `getTransitionMetadata(from, to)`, `getTransitionLabel(from, to)`
- **Query functions**: `isTerminalState(state)`, `getInitialState()`, `isXxxState(value)` (type guard)
- **Summary function**: `getStateMachineSummary()` -- returns all states, transitions, metadata

### Employee Lifecycle

States: `pending` -> `active` <-> `on_leave` -> `terminated`

| From | Valid Targets |
|------|---------------|
| `pending` | `active`, `terminated` |
| `active` | `on_leave`, `terminated` |
| `on_leave` | `active`, `terminated` |
| `terminated` | (terminal) |

Additional helpers: `isActiveEmployee(state)`, `EMPLOYEE_TRANSITION_LABELS`

### Performance Cycle

States: `draft` -> `active` -> `review` -> `calibration` -> `closed`

Additional helpers: `isCycleInProgress(state)`, `areRatingsLocked(state)`, `areGoalsLocked(state)`, `getPhaseInfo(state)`, `PHASE_INFO`

### Leave Request

States: `draft` -> `pending` -> `approved` / `rejected` / `cancelled` / `withdrawn`

Additional helpers: `leaveRequestRequiresAction(state)`, `LEAVE_REQUEST_TRANSITION_LABELS`

### Case Management

States: `open` -> `in_progress` -> `resolved` -> `closed` (with escalation, reopening)

Additional helpers: `isCaseActive(state)`, `CASE_TRANSITION_LABELS`

### Flexible Working

States for UK flexible working requests with statutory rejection grounds.

Additional helpers: `requiresConsultationBeforeRejection(state)`, `isStatutoryRejectionGround(ground)`, `STATUTORY_REJECTION_GROUNDS`, `REJECTION_GROUND_LABELS`

### Data Breach

GDPR data breach lifecycle states.

Additional helpers: `isIcoNotificationPending(state)`, `DATA_BREACH_TRANSITION_LABELS`

### Workflow

States: `draft` -> `pending` -> `in_progress` -> `completed` / `cancelled` / `failed`

Additional helpers: `isWorkflowActive(state)`, `workflowRequiresApproval(state)`, `WORKFLOW_TRANSITION_LABELS`

### Onboarding (3 sub-machines)

**Template**: `draft` -> `active` -> `archived` (`isTemplateUsable`)
**Instance**: `pending` -> `preboarding` -> `in_progress` -> `completed` / `cancelled` / `on_hold` (`isInstanceActive`)
**Task**: `pending` -> `available` -> `in_progress` -> `completed` / `skipped` / `blocked` (`isTaskActionable`)

### Recruitment (3 sub-machines)

**Requisition**: `draft` -> `pending_approval` -> `approved` -> `open` -> `filled` / `cancelled` / `closed` (`isRequisitionActive`)
**Candidate Stage**: `applied` -> `screening` -> `interview` -> `assessment` -> `offer` -> `hired` / `rejected` / `withdrawn` (`isCandidateActive`)
**Offer**: `draft` -> `pending_approval` -> `approved` -> `sent` -> `accepted` / `declined` / `expired` / `withdrawn` / `countered` (`isOfferActive`)

---

## Usage Examples

### Importing types

```typescript
// From main entry (re-exports everything)
import type { Employee, LeaveRequest, UUID } from "@staffora/shared";

// From specific sub-path (tree-shakeable)
import type { Employee } from "@staffora/shared/types";
import { ErrorCodes, createNotFoundError } from "@staffora/shared/errors";
import { CacheTTL, SystemRoles } from "@staffora/shared/constants";
```

### Using state machines

```typescript
import {
  canTransition,
  EmployeeStates,
  validateTransition,
} from "@staffora/shared/state-machines";

// Check if transition is valid
if (canTransition("active", "on_leave")) {
  // Proceed with status change
}

// Validate and throw if invalid
validateTransition("terminated", "active");
// throws: "Invalid transition from 'terminated' to 'active'"
```

### Using effective dating

```typescript
import { validateNoOverlap } from "@staffora/shared/utils";

const result = validateNoOverlap(
  "emp-123",
  "position",
  { effectiveFrom: "2026-04-01", effectiveTo: null },
  existingPositions
);

if (!result.valid) {
  throw new Error(result.errorMessage);
}
```

### Using error factories

```typescript
import { createNotFoundError, createValidationError } from "@staffora/shared/errors";

// 404 error
throw createNotFoundError("Employee", "emp_123");

// 400 validation error with field details
throw createValidationError({
  email: ["Invalid email format"],
  startDate: ["Start date is required"],
});
```

### Using TypeBox schemas

```typescript
import { IdParamSchema, CursorPaginationSchema, createPaginatedResponseSchema } from "@staffora/shared/schemas";
import { Type } from "@sinclair/typebox";

const EmployeeSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  employeeNumber: Type.String(),
  status: Type.String(),
});

const ListResponseSchema = createPaginatedResponseSchema(EmployeeSchema);
```

### Using UK compliance utilities

```typescript
import { calculateBradfordFactor, calculateStatutoryNoticePeriod, calculateHolidayPay } from "@staffora/shared/utils";

// Bradford Factor
const bf = calculateBradfordFactor(absenceSpells);
console.log(`Score: ${bf.score}, Level: ${bf.level}`);

// Statutory notice
const notice = calculateStatutoryNoticePeriod({
  hireDate: "2020-01-15",
  contractualNoticeDays: 30,
});
console.log(notice.complianceMessage);
```

---

## Related Documents

- [Architecture Overview](./ARCHITECTURE.md) -- System design and plugin chain
- [Database Guide](./database-guide.md) -- Schema, migrations, RLS patterns
- [State Machines](./state-machines.md) -- Mermaid diagrams for all state machines
- [Error Codes Reference](../04-api/error-codes.md) -- Complete error code listing
- [API Reference](../04-api/api-reference.md) -- All 200+ API endpoints
- [Permissions System](./PERMISSIONS_SYSTEM.md) -- 7-layer access control details
