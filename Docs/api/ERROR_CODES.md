# Error Codes Reference

*Last updated: 2026-03-17*

All error codes are defined in `packages/shared/src/errors/codes.ts` with human-readable messages in `packages/shared/src/errors/messages.ts`.

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

## Generic Errors

| Code | HTTP Status | Message |
|------|:-----------:|---------|
| `VALIDATION_ERROR` | 400 | The provided data is invalid. Please check your input and try again. |
| `NOT_FOUND` | 404 | The requested resource was not found. |
| `FORBIDDEN` | 403 | You do not have permission to perform this action. |
| `UNAUTHORIZED` | 401 | Authentication is required. Please log in to continue. |
| `CONFLICT` | 409 | A conflict occurred. The resource may have been modified by another user. |
| `INTERNAL_ERROR` | 500 | An unexpected error occurred. Please try again later or contact support. |
| `SERVICE_UNAVAILABLE` | 503 | The service is temporarily unavailable. Please try again later. |

## Authentication Errors

| Code | Message |
|------|---------|
| `INVALID_CREDENTIALS` | Invalid email or password. Please check your credentials and try again. |
| `SESSION_EXPIRED` | Your session has expired. Please log in again to continue. |
| `MFA_REQUIRED` | Multi-factor authentication is required. Please complete the verification. |
| `MFA_INVALID` | Invalid verification code. Please check the code and try again. |
| `ACCOUNT_LOCKED` | Your account has been locked due to multiple failed login attempts. Please contact your administrator. |
| `ACCOUNT_SUSPENDED` | Your account has been suspended. Please contact your administrator for assistance. |

## Tenant Errors

| Code | Message |
|------|---------|
| `TENANT_NOT_FOUND` | The organization was not found. Please verify the organization identifier. |
| `TENANT_SUSPENDED` | This organization's account has been suspended. Please contact support. |
| `TENANT_ACCESS_DENIED` | You do not have access to this organization. |

## Core HR Errors

| Code | Message |
|------|---------|
| `EFFECTIVE_DATE_OVERLAP` | The effective dates overlap with an existing record. Please adjust the dates. |
| `INVALID_LIFECYCLE_TRANSITION` | This status change is not allowed. Please check the employee's current status. |
| `TERMINATION_DATE_BEFORE_HIRE` | The termination date cannot be before the hire date. |
| `POSITION_ALREADY_FILLED` | This position is already filled by another employee. |
| `EMPLOYEE_NOT_FOUND` | The employee was not found. Please verify the employee identifier. |
| `ORG_UNIT_HAS_CHILDREN` | Cannot delete this organizational unit because it has child units. Please remove or reassign the child units first. |
| `CIRCULAR_REPORTING_LINE` | This change would create a circular reporting relationship, which is not allowed. |

## Time & Attendance Errors

| Code | Message |
|------|---------|
| `TIMESHEET_ALREADY_APPROVED` | This timesheet has already been approved and cannot be modified. |
| `CLOCK_EVENT_OUT_OF_SEQUENCE` | Clock events must be in sequence. For example, you must clock in before clocking out. |
| `INVALID_TIME_ENTRY` | The time entry is invalid. Please check the start and end times. |
| `SCHEDULE_CONFLICT` | This schedule conflicts with an existing schedule assignment. |

## Absence Management Errors

| Code | Message |
|------|---------|
| `INSUFFICIENT_LEAVE_BALANCE` | You do not have enough leave balance for this request. |
| `BLACKOUT_PERIOD_VIOLATION` | Leave cannot be requested during this blackout period. |
| `LEAVE_REQUEST_OVERLAP` | This leave request overlaps with an existing approved leave request. |
| `POLICY_NOT_FOUND` | The leave policy was not found. Please contact your HR administrator. |

## Workflow Errors

| Code | Message |
|------|---------|
| `INVALID_WORKFLOW_TRANSITION` | This workflow transition is not allowed from the current state. |
| `TASK_ALREADY_COMPLETED` | This task has already been completed and cannot be modified. |
| `WORKFLOW_NOT_FOUND` | The workflow was not found. Please verify the workflow identifier. |

## Talent Management Errors

| Code | Message |
|------|---------|
| `REQUISITION_CLOSED` | This job requisition has been closed and is no longer accepting applications. |
| `CANDIDATE_ALREADY_EXISTS` | A candidate with this information already exists in the system. |
| `OFFER_EXPIRED` | This job offer has expired and is no longer valid. |

## LMS Errors

| Code | Message |
|------|---------|
| `COURSE_NOT_FOUND` | The course was not found. Please verify the course identifier. |
| `PREREQUISITE_NOT_MET` | You must complete the prerequisite courses before enrolling in this course. |
| `ASSIGNMENT_ALREADY_COMPLETED` | This learning assignment has already been completed. |

## Case Management Errors

| Code | Message |
|------|---------|
| `CASE_CLOSED` | This case has been closed and cannot be modified. |
| `RESTRICTED_ACCESS` | You do not have access to view this case due to confidentiality restrictions. |

## Usage in Code

```typescript
import { ErrorCodes } from '@staffora/shared/errors';

// Reference error codes
if (condition) {
  throw new AppError(ErrorCodes.EMPLOYEE_NOT_FOUND, 404);
}

// Get user-friendly message
import { getErrorMessage } from '@staffora/shared/errors';
const message = getErrorMessage('EMPLOYEE_NOT_FOUND');
```

---

## Related Documents

- [API Reference](API_REFERENCE.md) — Complete endpoint documentation
- [Security Patterns](../patterns/SECURITY.md) — Authentication and authorization error scenarios
- [Frontend Guide](../guides/FRONTEND.md) — Error handling in the React frontend
- [Architecture Overview](../architecture/ARCHITECTURE.md) — Error plugin in the plugin pipeline
