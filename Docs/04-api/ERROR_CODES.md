# Error Codes Reference

*Last updated: 2026-03-28*

All error codes are defined in `packages/shared/src/errors/codes.ts` with human-readable messages in `packages/shared/src/errors/messages.ts`. The API layer extends these with additional codes in `packages/api/src/plugins/errors.ts`. Some modules also define module-specific error codes in their service files.

## Error Response Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {},
    "requestId": "req_abc123"
  }
}
```

All error responses include a `requestId` for tracing. The `details` field is optional and may contain additional context (e.g., field-level validation errors, resource identifiers). In production, stack traces and internal details are omitted.

---

## Generic Errors

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `VALIDATION_ERROR` | 400 | The provided data is invalid. Please check your input and try again. |
| `BAD_REQUEST` | 400 | Failed to parse request body. |
| `NOT_FOUND` | 404 | The requested resource was not found. |
| `FORBIDDEN` | 403 | You do not have permission to perform this action. |
| `UNAUTHORIZED` | 401 | Authentication is required. Please log in to continue. |
| `CONFLICT` | 409 | A conflict occurred. The resource may have been modified by another user. |
| `METHOD_NOT_ALLOWED` | 405 | The HTTP method is not allowed for this endpoint. |
| `TOO_MANY_REQUESTS` | 429 | Too many requests. Please slow down and try again. |
| `INTERNAL_ERROR` | 500 | An unexpected error occurred. Please try again later or contact support. |
| `SERVICE_UNAVAILABLE` | 503 | The service is temporarily unavailable. Please try again later. |

---

## Authentication Errors

Defined in `packages/shared/src/errors/codes.ts` (AuthErrorCodes) and extended in `packages/api/src/plugins/auth-better.ts`.

### Shared Authentication Errors

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `INVALID_CREDENTIALS` | 401 | Invalid email or password. Please check your credentials and try again. |
| `SESSION_EXPIRED` | 401 | Your session has expired. Please log in again to continue. |
| `MFA_REQUIRED` | 403 | Multi-factor authentication is required. Please complete the verification. |
| `MFA_INVALID` | 403 | Invalid verification code. Please check the code and try again. |
| `ACCOUNT_LOCKED` | 423 | Your account has been locked due to multiple failed login attempts. Please contact your administrator. |
| `ACCOUNT_SUSPENDED` | 403 | Your account has been suspended. Please contact your administrator for assistance. |

### API-Layer Authentication Errors

These codes are used by the auth-better plugin for session and CSRF handling.

| Code | HTTP Status | Message | Source |
|------|:-----------:|---------|--------|
| `SESSION_INVALID` | 401 | The session is invalid or has been revoked. | `plugins/errors.ts` |
| `ACCOUNT_NOT_VERIFIED` | 401 | The account has not been verified. Email verification is required. | `plugins/errors.ts` |
| `CSRF_INVALID` | 403 | CSRF token is invalid or missing. | `plugins/errors.ts` |
| `AUTH_INVALID_SESSION` | 401 | Invalid session. | `plugins/auth-better.ts` |
| `AUTH_SESSION_EXPIRED` | 401 | Session has expired. | `plugins/auth-better.ts` |
| `AUTH_USER_NOT_FOUND` | 404 | User not found for the session. | `plugins/auth-better.ts` |
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid credentials. | `plugins/auth-better.ts` |
| `AUTH_MFA_REQUIRED` | 403 | MFA is required. | `plugins/auth-better.ts` |
| `AUTH_MFA_INVALID` | 403 | Invalid MFA code. | `plugins/auth-better.ts` |
| `AUTH_ACCOUNT_SUSPENDED` | 403 | Account is suspended. | `plugins/auth-better.ts` |
| `AUTH_ACCOUNT_DELETED` | 403 | Account has been deleted. | `plugins/auth-better.ts` |
| `AUTH_CSRF_INVALID` | 403 | CSRF validation failed. | `plugins/auth-better.ts` |

---

## Tenant Errors

Defined in `packages/shared/src/errors/codes.ts` (TenantErrorCodes) and extended in `packages/api/src/plugins/tenant.ts`.

### Shared Tenant Errors

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `TENANT_NOT_FOUND` | 404 | The organization was not found. Please verify the organization identifier. |
| `TENANT_SUSPENDED` | 403 | This organization's account has been suspended. Please contact support. |
| `TENANT_ACCESS_DENIED` | 403 | You do not have access to this organization. |

### API-Layer Tenant Errors

| Code | HTTP Status | Message | Source |
|------|:-----------:|---------|--------|
| `MISSING_TENANT` | 400 | Tenant identifier is missing from the request. | `plugins/errors.ts` / `plugins/tenant.ts` |
| `INVALID_TENANT` | 400 | The tenant identifier is invalid. | `plugins/errors.ts` / `plugins/tenant.ts` |
| `TENANT_DELETED` | 404 | The tenant has been deleted. | `plugins/errors.ts` / `plugins/tenant.ts` |

---

## Authorization (RBAC) Errors

Defined in `packages/api/src/plugins/rbac.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `PERMISSION_DENIED` | 403 | You do not have the required permission for this action. |
| `MFA_REQUIRED_FOR_ACTION` | 403 | Multi-factor authentication is required for this specific action. |
| `CONSTRAINT_VIOLATION` | 403 | A security constraint prevented this action. |

---

## Idempotency Errors

Defined in `packages/api/src/plugins/idempotency.ts` and `packages/api/src/plugins/errors.ts`.

All mutating endpoints require an `Idempotency-Key` header. These errors relate to idempotency key validation and deduplication.

| Code | HTTP Status | Message | Source |
|------|:-----------:|---------|--------|
| `MISSING_IDEMPOTENCY_KEY` | 400 | The Idempotency-Key header is required for this request. | `plugins/idempotency.ts` |
| `INVALID_IDEMPOTENCY_KEY` | 400 | The Idempotency-Key header format is invalid. | `plugins/idempotency.ts` |
| `REQUEST_IN_PROGRESS` | 409 | A request with this idempotency key is already being processed. | `plugins/idempotency.ts` |
| `REQUEST_MISMATCH` | 400 | The request body does not match the original request for this idempotency key. | `plugins/idempotency.ts` |
| `IDEMPOTENCY_KEY_REUSED` | 409 | This idempotency key has already been used for a different request. | `plugins/errors.ts` |
| `IDEMPOTENCY_HASH_MISMATCH` | 400 | The request payload hash does not match the original request. | `plugins/errors.ts` |
| `REQUEST_STILL_PROCESSING` | 409 | The original request is still being processed. | `plugins/errors.ts` |

---

## Core HR Errors

Defined in `packages/shared/src/errors/codes.ts` (HRErrorCodes).

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `EFFECTIVE_DATE_OVERLAP` | 409 | The effective dates overlap with an existing record. Please adjust the dates. |
| `INVALID_LIFECYCLE_TRANSITION` | 409 | This status change is not allowed. Please check the employee's current status. |
| `TERMINATION_DATE_BEFORE_HIRE` | 400 | The termination date cannot be before the hire date. |
| `POSITION_ALREADY_FILLED` | 409 | This position is already filled by another employee. |
| `EMPLOYEE_NOT_FOUND` | 404 | The employee was not found. Please verify the employee identifier. |
| `ORG_UNIT_HAS_CHILDREN` | 409 | Cannot delete this organizational unit because it has child units. Please remove or reassign the child units first. |
| `CIRCULAR_REPORTING_LINE` | 400 | This change would create a circular reporting relationship, which is not allowed. |

---

## Time & Attendance Errors

Defined in `packages/shared/src/errors/codes.ts` (TimeErrorCodes) and extended in `packages/api/src/modules/time/service.ts`.

### Shared Time Errors

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `TIMESHEET_ALREADY_APPROVED` | 409 | This timesheet has already been approved and cannot be modified. |
| `CLOCK_EVENT_OUT_OF_SEQUENCE` | 400 | Clock events must be in sequence. For example, you must clock in before clocking out. |
| `INVALID_TIME_ENTRY` | 400 | The time entry is invalid. Please check the start and end times. |
| `SCHEDULE_CONFLICT` | 409 | This schedule conflicts with an existing schedule assignment. |

### Module-Level Time Errors

These codes are defined in the Time module service (`modules/time/service.ts`).

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `TIME_POLICY_NOT_FOUND` | 404 | The time policy was not found. |
| `TIME_EVENT_NOT_FOUND` | 404 | The time event was not found. |
| `SCHEDULE_NOT_FOUND` | 404 | The schedule was not found. |
| `SHIFT_NOT_FOUND` | 404 | The shift was not found. |
| `TIMESHEET_NOT_FOUND` | 404 | The timesheet was not found. |
| `TIMESHEET_ALREADY_SUBMITTED` | 409 | This timesheet has already been submitted. |
| `TIMESHEET_NOT_SUBMITTED` | 400 | The timesheet has not been submitted and cannot be approved or rejected. |
| `INVALID_TIME_SEQUENCE` | 400 | The time entries are not in a valid sequence. |
| `SHIFT_OVERLAP` | 409 | The shift overlaps with an existing shift assignment. |
| `INVALID_DATE_RANGE` | 400 | The date range is invalid. The start date must be before the end date. |
| `APPROVAL_CHAIN_NOT_FOUND` | 404 | The approval chain was not found. |
| `NOT_AUTHORIZED_APPROVER` | 403 | You are not an authorized approver for this timesheet. |
| `APPROVAL_CHAIN_EMPTY` | 400 | The approval chain has no approvers configured. |

---

## Shift Swap Errors

Defined in `packages/api/src/modules/shift-swaps/service.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `SWAP_REQUEST_NOT_FOUND` | 404 | The shift swap request was not found. |
| `ASSIGNMENT_NOT_FOUND` | 404 | The shift assignment was not found. |
| `CANNOT_SWAP_OWN_SHIFT` | 400 | You cannot create a swap request for your own shift. |
| `ASSIGNMENT_OWNER_MISMATCH` | 403 | The shift assignment does not belong to the specified employee. |
| `PENDING_SWAP_EXISTS` | 409 | A pending swap request already exists for this shift. |
| `NOT_TARGET_EMPLOYEE` | 403 | You are not the target employee for this swap request. |
| `NOT_REQUESTER` | 403 | You are not the requester of this swap. |
| `INVALID_STATUS_FOR_ACCEPT` | 409 | The swap request cannot be accepted in its current status. |
| `INVALID_STATUS_FOR_REJECT` | 409 | The swap request cannot be rejected in its current status. |
| `INVALID_STATUS_FOR_APPROVE` | 409 | The swap request cannot be approved in its current status. |
| `INVALID_STATUS_FOR_CANCEL` | 409 | The swap request cannot be cancelled in its current status. |
| `STATE_MACHINE_VIOLATION` | 409 | The requested state transition is not valid. |

---

## Absence Management Errors

Defined in `packages/shared/src/errors/codes.ts` (AbsenceErrorCodes) and extended in `packages/api/src/modules/absence/service.ts`.

### Shared Absence Errors

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `INSUFFICIENT_LEAVE_BALANCE` | 400 | You do not have enough leave balance for this request. |
| `BLACKOUT_PERIOD_VIOLATION` | 400 | Leave cannot be requested during this blackout period. |
| `LEAVE_REQUEST_OVERLAP` | 409 | This leave request overlaps with an existing approved leave request. |
| `POLICY_NOT_FOUND` | 404 | The leave policy was not found. Please contact your HR administrator. |

### Module-Level Absence Errors

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `LEAVE_TYPE_NOT_FOUND` | 404 | The leave type was not found. |
| `LEAVE_POLICY_NOT_FOUND` | 404 | The leave policy was not found. |
| `LEAVE_REQUEST_NOT_FOUND` | 404 | The leave request was not found. |
| `INSUFFICIENT_BALANCE` | 400 | Insufficient leave balance for this request. |
| `BLACKOUT_PERIOD` | 403 | Leave cannot be requested during this blackout period. |
| `REQUEST_NOT_PENDING` | 400 | The leave request is not in a pending status and cannot be approved or rejected. |
| `REQUEST_ALREADY_PROCESSED` | 409 | The leave request has already been processed. |
| `BELOW_STATUTORY_MINIMUM` | 422 | The leave entitlement is below the UK statutory minimum. |

---

## TOIL (Time Off In Lieu) Errors

Defined in `packages/api/src/modules/toil/service.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `TOIL_BALANCE_NOT_FOUND` | 404 | No TOIL balance was found for this employee. |
| `INSUFFICIENT_TOIL_BALANCE` | 400 | Insufficient TOIL balance for this request. |
| `TOIL_ZERO_ADJUSTMENT` | 400 | A zero-value adjustment is not allowed. |
| `TOIL_DATE_OUTSIDE_PERIOD` | 400 | The date falls outside the TOIL accrual period. |
| `TOIL_ACCRUAL_REASON_REQUIRED` | 400 | A reason is required for TOIL accruals. |
| `TOIL_PERIOD_EXPIRED` | 400 | The TOIL period has expired. |
| `TOIL_TRANSACTION_NOT_FOUND` | 404 | The TOIL transaction was not found. |

---

## Delegation Errors

Defined in `packages/api/src/modules/delegations/service.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `DELEGATION_NOT_FOUND` | 404 | The delegation was not found. |
| `SELF_DELEGATION` | 400 | You cannot delegate to yourself. |
| `CIRCULAR_DELEGATION` | 400 | This delegation would create a circular chain, which is not allowed. |
| `OVERLAPPING_DELEGATION` | 409 | This delegation overlaps with an existing active delegation. |
| `INVALID_DATE_RANGE` | 400 | The date range is invalid. The start date must be before the end date. |
| `ALREADY_REVOKED` | 409 | This delegation has already been revoked. |

---

## Overtime Rules Errors

Defined in `packages/api/src/modules/overtime-rules/service.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `NOT_FOUND` | 404 | The overtime rule or calculation was not found. |
| `EFFECTIVE_DATE_OVERLAP` | 409 | The effective dates overlap with an existing overtime rule. |
| `STATE_MACHINE_VIOLATION` | 409 | The requested state transition for the overtime rule is not valid. |
| `NO_ACTIVE_RULES` | 404 | No active overtime rules were found. |
| `INVALID_DATE_RANGE` | 400 | The date range is invalid. |
| `EMPLOYEE_NOT_FOUND` | 404 | The employee was not found. |

---

## Workflow Errors

Defined in `packages/shared/src/errors/codes.ts` (WorkflowErrorCodes).

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `INVALID_WORKFLOW_TRANSITION` | 409 | This workflow transition is not allowed from the current state. |
| `TASK_ALREADY_COMPLETED` | 409 | This task has already been completed and cannot be modified. |
| `WORKFLOW_NOT_FOUND` | 404 | The workflow was not found. Please verify the workflow identifier. |

---

## Talent Management Errors

Defined in `packages/shared/src/errors/codes.ts` (TalentErrorCodes) and extended in `packages/api/src/plugins/errors.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `REQUISITION_CLOSED` | 409 | This job requisition has been closed and is no longer accepting applications. |
| `CANDIDATE_ALREADY_EXISTS` | 409 | A candidate with this information already exists in the system. |
| `OFFER_EXPIRED` | 410 | This job offer has expired and is no longer valid. |

---

## Recruitment Errors

Defined in `packages/api/src/plugins/errors.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `REQUISITION_NOT_OPEN` | 409 | The requisition is not in an open status and cannot accept applications. |
| `INVALID_STAGE_TRANSITION` | 409 | The candidate cannot be moved to the requested recruitment stage. |
| `DUPLICATE_APPLICATION` | 409 | A duplicate application already exists for this candidate and requisition. |

---

## LMS (Learning Management System) Errors

Defined in `packages/shared/src/errors/codes.ts` (LMSErrorCodes).

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `COURSE_NOT_FOUND` | 404 | The course was not found. Please verify the course identifier. |
| `PREREQUISITE_NOT_MET` | 400 | You must complete the prerequisite courses before enrolling in this course. |
| `ASSIGNMENT_ALREADY_COMPLETED` | 409 | This learning assignment has already been completed. |

---

## Case Management Errors

Defined in `packages/shared/src/errors/codes.ts` (CaseErrorCodes).

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `CASE_CLOSED` | 409 | This case has been closed and cannot be modified. |
| `RESTRICTED_ACCESS` | 403 | You do not have access to view this case due to confidentiality restrictions. |

---

## Onboarding Errors

Defined in `packages/api/src/plugins/errors.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `TEMPLATE_INACTIVE` | 409 | The onboarding template is inactive and cannot be used. |
| `ALREADY_ONBOARDING` | 409 | This employee already has an active onboarding process. |
| `INSTANCE_CLOSED` | 409 | The onboarding instance has been closed and cannot be modified. |
| `CANNOT_SKIP_REQUIRED` | 409 | Required onboarding tasks cannot be skipped. |
| `COMPLIANCE_CHECKS_OUTSTANDING` | 409 | There are outstanding compliance checks that must be completed before proceeding. |

---

## Succession Planning Errors

Defined in `packages/api/src/plugins/errors.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `SUCCESSION_PLAN_NOT_FOUND` | 404 | The succession plan was not found. |
| `CANDIDATE_ALREADY_IN_PLAN` | 409 | This candidate is already included in the succession plan. |
| `PLAN_INACTIVE` | 409 | The succession plan is inactive and cannot be modified. |

---

## Competency Errors

Defined in `packages/api/src/plugins/errors.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `COMPETENCY_ALREADY_ASSIGNED` | 409 | This competency is already assigned to the target resource. |

---

## Benefits Errors

Defined in `packages/api/src/plugins/errors.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `LIFE_EVENT_ALREADY_REVIEWED` | 409 | This life event has already been reviewed and cannot be processed again. |

Benefits module services also use generic error codes (`NOT_FOUND`, `VALIDATION_ERROR`, `INTERNAL_ERROR`, `CONFLICT`) for plan, enrolment, flex fund, and company car operations.

---

## Payroll Errors

Defined in `packages/shared/src/errors/codes.ts` (PayrollErrorCodes) and extended in `packages/api/src/plugins/errors.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `INVALID_TAX_CODE_FORMAT` | 400 | The tax code format is invalid. UK HMRC tax codes must follow patterns like 1257L, BR, D0, D1, NT, S1257L, C1257L, K100. |
| `NO_CURRENT_TAX_CODE` | 400 | No current tax code was found for this employee. Please assign a tax code before processing payroll. |
| `INVALID_PAYROLL_TRANSITION` | 409 | This payroll run status change is not allowed from the current status. |
| `PAYROLL_PERIOD_FINALIZED` | 423 | The payroll period has been finalized and is locked for changes. |

---

## Documents Errors

Defined in `packages/shared/src/errors/codes.ts` (DocumentsErrorCodes).

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `VIRUS_DETECTED` | 422 | The uploaded file has been flagged as potentially malicious and was rejected. Please scan your file with antivirus software and try again. |

---

## Analytics Errors

Defined in `packages/api/src/plugins/errors.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `INVALID_DATE_RANGE` | 400 | The date range is invalid. The start date must be before the end date. |

---

## Portal Errors

Defined in `packages/api/src/plugins/errors.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `PORTAL_ACCESS_DENIED` | 403 | Access to the client portal is denied. |
| `NO_EMPLOYEE_RECORD` | 404 | No employee record was found for this portal user. |

---

## Business Logic Errors

These are cross-cutting error codes used by multiple modules. Defined in `packages/api/src/plugins/errors.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `STATE_MACHINE_VIOLATION` | 409 | The requested state transition is not valid from the current state. Used across modules including warnings, whistleblowing, TUPE, tribunal, data erasure, overtime rules, and shift swaps. |
| `RESOURCE_IN_USE` | 409 | The resource cannot be deleted or modified because it is currently in use. |
| `LIMIT_EXCEEDED` | 429 | A usage or resource limit has been exceeded. |

---

## Report Errors

Defined in `packages/api/src/plugins/errors.ts`.

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `REPORT_GENERATION_FAILED` | 500 | The report could not be generated. Please try again or contact support. |

---

## GDPR / Data Protection Errors

Modules such as data-erasure, consent, DSAR, data-breach, privacy-notices, and data-retention use a combination of generic and business logic error codes. The most commonly used codes include:

| Code | HTTP Status | Usage |
|------|:-----------:|-------|
| `NOT_FOUND` | 404 | DSAR request, consent record, data breach, privacy notice, or erasure request not found. |
| `STATE_MACHINE_VIOLATION` | 409 | Invalid status transition for data erasure requests, DSAR processing, or data breach workflow. |
| `FORBIDDEN` | 403 | User not authorized to access or modify a GDPR record. |
| `CONFLICT` | 409 | Duplicate consent, overlapping retention policies. |
| `VALIDATION_ERROR` | 400 | Invalid input data for GDPR operations. |

---

## UK Compliance Module Errors

UK compliance modules (right-to-work, SSP, statutory-leave, pension, warnings, TUPE, tribunal, whistleblowing, NMW, IR35, DBS checks, etc.) use a combination of generic and business logic error codes. The most commonly used codes include:

| Code | HTTP Status | Usage |
|------|:-----------:|-------|
| `NOT_FOUND` | 404 | Compliance record not found. |
| `STATE_MACHINE_VIOLATION` | 409 | Invalid status transition for compliance workflows (warning stages, TUPE transfers, tribunal proceedings, whistleblowing cases). |
| `VALIDATION_ERROR` | 400 | Invalid input data (e.g., NI number format, tax code format). |
| `FORBIDDEN` | 403 | Insufficient permissions for compliance operations. |

---

## Module Error Code Usage Summary

The following table shows which error codes are used by each of the 120 modules. Modules not listed here use only the generic error codes (`NOT_FOUND`, `VALIDATION_ERROR`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_ERROR`).

| Module | Module-Specific Error Codes Used |
|--------|----------------------------------|
| absence | `LEAVE_TYPE_NOT_FOUND`, `LEAVE_POLICY_NOT_FOUND`, `LEAVE_REQUEST_NOT_FOUND`, `INSUFFICIENT_BALANCE`, `BLACKOUT_PERIOD`, `REQUEST_NOT_PENDING`, `REQUEST_ALREADY_PROCESSED`, `BELOW_STATUTORY_MINIMUM`, plus shared absence codes |
| agencies | `NOT_FOUND`, `VALIDATION_ERROR` |
| agency-workers | `NOT_FOUND`, `VALIDATION_ERROR` |
| announcements | `NOT_FOUND` |
| assessments | `INTERNAL_ERROR` |
| auth | `FORBIDDEN`, `INTERNAL_ERROR` |
| background-checks | `MISSING_TENANT`, `INTERNAL_ERROR` |
| bank-details | `NOT_FOUND`, `VALIDATION_ERROR`, `EFFECTIVE_DATE_OVERLAP` |
| bank-holidays | `NOT_FOUND`, `CONFLICT` |
| benefits | `NOT_FOUND`, `VALIDATION_ERROR`, `INTERNAL_ERROR`, `LIFE_EVENT_ALREADY_REVIEWED` |
| benefits-exchange | `NOT_FOUND` |
| cases | `CASE_CLOSED`, `RESTRICTED_ACCESS` |
| competencies | `COMPETENCY_ALREADY_ASSIGNED` |
| consent | `NOT_FOUND`, `CONFLICT`, `VALIDATION_ERROR`, `INTERNAL_ERROR` |
| data-erasure | `NOT_FOUND`, `STATE_MACHINE_VIOLATION`, `FORBIDDEN` |
| delegations | `DELEGATION_NOT_FOUND`, `SELF_DELEGATION`, `CIRCULAR_DELEGATION`, `OVERLAPPING_DELEGATION`, `INVALID_DATE_RANGE`, `ALREADY_REVOKED` |
| documents | `VIRUS_DETECTED` |
| hr | `EFFECTIVE_DATE_OVERLAP`, `INVALID_LIFECYCLE_TRANSITION`, `TERMINATION_DATE_BEFORE_HIRE`, `POSITION_ALREADY_FILLED`, `EMPLOYEE_NOT_FOUND`, `ORG_UNIT_HAS_CHILDREN`, `CIRCULAR_REPORTING_LINE` |
| lms | `COURSE_NOT_FOUND`, `PREREQUISITE_NOT_MET`, `ASSIGNMENT_ALREADY_COMPLETED` |
| onboarding | `TEMPLATE_INACTIVE`, `ALREADY_ONBOARDING`, `INSTANCE_CLOSED`, `CANNOT_SKIP_REQUIRED`, `COMPLIANCE_CHECKS_OUTSTANDING` |
| overtime-rules | `NOT_FOUND`, `EFFECTIVE_DATE_OVERLAP`, `STATE_MACHINE_VIOLATION`, `NO_ACTIVE_RULES`, `INVALID_DATE_RANGE`, `EMPLOYEE_NOT_FOUND` |
| payroll | `INVALID_TAX_CODE_FORMAT`, `NO_CURRENT_TAX_CODE`, `INVALID_PAYROLL_TRANSITION`, `PAYROLL_PERIOD_FINALIZED` |
| recruitment | `REQUISITION_NOT_OPEN`, `INVALID_STAGE_TRANSITION`, `DUPLICATE_APPLICATION`, `REQUISITION_CLOSED`, `CANDIDATE_ALREADY_EXISTS`, `OFFER_EXPIRED` |
| shift-swaps | `SWAP_REQUEST_NOT_FOUND`, `ASSIGNMENT_NOT_FOUND`, `CANNOT_SWAP_OWN_SHIFT`, `ASSIGNMENT_OWNER_MISMATCH`, `PENDING_SWAP_EXISTS`, `NOT_TARGET_EMPLOYEE`, `NOT_REQUESTER`, `INVALID_STATUS_FOR_ACCEPT`, `INVALID_STATUS_FOR_REJECT`, `INVALID_STATUS_FOR_APPROVE`, `INVALID_STATUS_FOR_CANCEL`, `STATE_MACHINE_VIOLATION` |
| succession | `SUCCESSION_PLAN_NOT_FOUND`, `CANDIDATE_ALREADY_IN_PLAN`, `PLAN_INACTIVE` |
| talent | `REQUISITION_CLOSED`, `CANDIDATE_ALREADY_EXISTS`, `OFFER_EXPIRED` |
| time | `TIME_POLICY_NOT_FOUND`, `TIME_EVENT_NOT_FOUND`, `SCHEDULE_NOT_FOUND`, `SHIFT_NOT_FOUND`, `TIMESHEET_NOT_FOUND`, `TIMESHEET_ALREADY_SUBMITTED`, `TIMESHEET_ALREADY_APPROVED`, `TIMESHEET_NOT_SUBMITTED`, `INVALID_TIME_SEQUENCE`, `SHIFT_OVERLAP`, `INVALID_DATE_RANGE`, `APPROVAL_CHAIN_NOT_FOUND`, `NOT_AUTHORIZED_APPROVER`, `APPROVAL_CHAIN_EMPTY` |
| toil | `TOIL_BALANCE_NOT_FOUND`, `INSUFFICIENT_TOIL_BALANCE`, `TOIL_ZERO_ADJUSTMENT`, `TOIL_DATE_OUTSIDE_PERIOD`, `TOIL_ACCRUAL_REASON_REQUIRED`, `TOIL_PERIOD_EXPIRED`, `TOIL_TRANSACTION_NOT_FOUND` |
| tribunal | `STATE_MACHINE_VIOLATION` |
| tupe | `STATE_MACHINE_VIOLATION` |
| warnings | `STATE_MACHINE_VIOLATION` |
| whistleblowing | `STATE_MACHINE_VIOLATION` |
| workflows | `INVALID_WORKFLOW_TRANSITION`, `TASK_ALREADY_COMPLETED`, `WORKFLOW_NOT_FOUND` |

All other modules (admin-jobs, analytics, api-keys, beneficiary-nominations, bereavement, bulk-document-generation, bulk-operations, calendar-sync, carers-leave, client-portal, contract-amendments, contract-statements, cost-centre-assignments, course-ratings, cpd, dashboard, data-archival, data-breach, data-import, data-retention, dbs-checks, deductions, diversity, dpia, dsar, e-signatures, email-tracking, emergency-contacts, employee-change-requests, employee-photos, equipment, family-leave, feature-flags, feedback-360, flexible-working, gender-pay-gap, geofence, global-mobility, headcount-planning, health-safety, income-protection, integrations, ir35, job-boards, jobs, letter-templates, lookup-values, nmw, notifications, offer-letters, one-on-ones, overtime, overtime-requests, parental-leave, payroll-config, payslips, pension, personal-detail-changes, policy-distribution, portal, privacy-notices, probation, reasonable-adjustments, recognition, reference-checks, reports, return-to-work, right-to-work, ropa, salary-sacrifice, secondments, security, sickness-analytics, sso, ssp, statutory-leave, suspensions, system, talent-pools, tax-codes, tenant, tenant-provisioning, total-reward, training-budgets, usage-stats, webhooks, wtr) primarily use the generic error codes (`NOT_FOUND`, `VALIDATION_ERROR`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_ERROR`) without defining module-specific error codes.

---

## HTTP Status Code Summary

| HTTP Status | Error Codes |
|:-----------:|-------------|
| **400** | `VALIDATION_ERROR`, `BAD_REQUEST`, `MISSING_TENANT`, `INVALID_TENANT`, `IDEMPOTENCY_HASH_MISMATCH`, `CLOCK_EVENT_OUT_OF_SEQUENCE`, `INVALID_TIME_ENTRY`, `INSUFFICIENT_LEAVE_BALANCE`, `BLACKOUT_PERIOD_VIOLATION`, `INVALID_DATE_RANGE`, `TERMINATION_DATE_BEFORE_HIRE`, `CIRCULAR_REPORTING_LINE`, `PREREQUISITE_NOT_MET` |
| **401** | `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `SESSION_EXPIRED`, `SESSION_INVALID`, `ACCOUNT_NOT_VERIFIED` |
| **403** | `FORBIDDEN`, `PERMISSION_DENIED`, `MFA_REQUIRED`, `MFA_INVALID`, `ACCOUNT_SUSPENDED`, `MFA_REQUIRED_FOR_ACTION`, `CSRF_INVALID`, `CONSTRAINT_VIOLATION`, `TENANT_SUSPENDED`, `TENANT_ACCESS_DENIED`, `PORTAL_ACCESS_DENIED`, `RESTRICTED_ACCESS` |
| **404** | `NOT_FOUND`, `TENANT_NOT_FOUND`, `TENANT_DELETED`, `EMPLOYEE_NOT_FOUND`, `COURSE_NOT_FOUND`, `POLICY_NOT_FOUND`, `WORKFLOW_NOT_FOUND`, `SUCCESSION_PLAN_NOT_FOUND`, `NO_EMPLOYEE_RECORD` |
| **405** | `METHOD_NOT_ALLOWED` |
| **409** | `CONFLICT`, `STATE_MACHINE_VIOLATION`, `EFFECTIVE_DATE_OVERLAP`, `INVALID_LIFECYCLE_TRANSITION`, `RESOURCE_IN_USE`, `IDEMPOTENCY_KEY_REUSED`, `REQUEST_STILL_PROCESSING`, `POSITION_ALREADY_FILLED`, `CANDIDATE_ALREADY_EXISTS`, `CANDIDATE_ALREADY_IN_PLAN`, `COMPETENCY_ALREADY_ASSIGNED`, `DUPLICATE_APPLICATION`, `LEAVE_REQUEST_OVERLAP`, `SCHEDULE_CONFLICT`, `TIMESHEET_ALREADY_APPROVED`, `TASK_ALREADY_COMPLETED`, `LIFE_EVENT_ALREADY_REVIEWED`, `ASSIGNMENT_ALREADY_COMPLETED`, `REQUISITION_CLOSED`, `REQUISITION_NOT_OPEN`, `INVALID_STAGE_TRANSITION`, `INVALID_WORKFLOW_TRANSITION`, `PLAN_INACTIVE`, `CASE_CLOSED`, `TEMPLATE_INACTIVE`, `ALREADY_ONBOARDING`, `INSTANCE_CLOSED`, `CANNOT_SKIP_REQUIRED`, `COMPLIANCE_CHECKS_OUTSTANDING`, `ORG_UNIT_HAS_CHILDREN`, `OFFER_EXPIRED` |
| **410** | `OFFER_EXPIRED` (shared layer maps to 410; API layer maps to 409) |
| **422** | `VIRUS_DETECTED` |
| **423** | `ACCOUNT_LOCKED`, `PAYROLL_PERIOD_FINALIZED` |
| **429** | `TOO_MANY_REQUESTS`, `LIMIT_EXCEEDED` |
| **500** | `INTERNAL_ERROR`, `REPORT_GENERATION_FAILED` |
| **503** | `SERVICE_UNAVAILABLE` |

> **Note:** The shared package (`packages/shared/src/errors/`) and the API errors plugin (`packages/api/src/plugins/errors.ts`) have slightly different HTTP status mappings for some codes (e.g., `OFFER_EXPIRED` is 410 in shared, 409 in the API plugin; `ACCOUNT_LOCKED` is 403 in shared, 423 in the API plugin). The API plugin mappings take precedence at runtime.

---

## Usage in Code

### Using Shared Error Codes

```typescript
import { ErrorCodes, getErrorMessage } from '@staffora/shared/errors';
import { AppError } from '@staffora/shared/errors';

// Throw with default message
throw new AppError(ErrorCodes.EMPLOYEE_NOT_FOUND, { statusCode: 404 });

// Get user-friendly message
const message = getErrorMessage('EMPLOYEE_NOT_FOUND');
// => "The employee was not found. Please verify the employee identifier."
```

### Using API Error Classes

```typescript
import {
  ErrorCodes,
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../../plugins/errors';

// Not found
throw new NotFoundError('Employee', 'emp-123');

// Validation error with field details
throw new ValidationError('Bad input', [
  { field: 'email', message: 'Invalid email format' },
  { field: 'name', message: 'Name is required' },
]);

// State machine violation
throw new ConflictError(
  'STATE_MACHINE_VIOLATION',
  'Cannot transition from draft to completed'
);

// Generic app error
throw new AppError('FORBIDDEN', 'Access denied');
```

### Using Module-Specific Error Codes

```typescript
import { AbsenceErrorCodes } from '../absence/service';

return {
  success: false,
  error: {
    code: AbsenceErrorCodes.LEAVE_TYPE_NOT_FOUND,
    message: 'Leave type not found',
  },
};
```

### Helper Functions

```typescript
import { createError, createValidationError, createNotFoundError } from '@staffora/shared/errors';

// Create a not-found error for a specific resource
throw createNotFoundError('Employee', 'emp-123');

// Create a validation error with field details
throw createValidationError({
  email: ['Invalid email format'],
  name: ['Name is required', 'Name must be at least 2 characters'],
});
```

---

## Related Documents

- [API Reference](API_REFERENCE.md) -- Complete endpoint documentation
- [Security Patterns](../02-architecture/security-patterns.md) -- Authentication and authorization error scenarios
- [Frontend Guide](../05-development/FRONTEND.md) -- Error handling in the React frontend
- [Architecture Overview](../02-architecture/ARCHITECTURE.md) -- Error plugin in the plugin pipeline
- [State Machines](../02-architecture/state-machines.md) -- State machine transitions and the `STATE_MACHINE_VIOLATION` error
