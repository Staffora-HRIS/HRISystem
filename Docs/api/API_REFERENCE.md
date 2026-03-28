# API Reference

*Last updated: 2026-03-28*

Base URL: `http://localhost:3000`

Interactive Swagger docs: `http://localhost:3000/docs`

## Common Headers

| Header | Required | Description |
|--------|:--------:|-------------|
| `Cookie: hris_session=...` | Yes | Session authentication |
| `Content-Type: application/json` | Yes (POST/PUT/PATCH) | Request body format |
| `X-CSRF-Token` | Yes (mutating) | CSRF protection |
| `Idempotency-Key` | Yes (mutating) | Request deduplication |
| `X-Tenant-ID` | Optional | Explicit tenant selection |
| `X-Request-ID` | Optional | Client-specified request ID |

## Response Format

### Success

```json
{
  "data": { ... },
  "pagination": { "nextCursor": "...", "hasMore": true, "count": 20 }
}
```

### Error

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

## Pagination

List endpoints use **cursor-based pagination**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cursor` | string | - | Cursor from previous response |
| `limit` | number | 20 | Items per page (max 100) |

---

## Health Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/health` | No | Full health check (database + redis status) |
| GET | `/ready` | No | Readiness probe |
| GET | `/live` | No | Liveness probe |

---

## Auth Module (`/api/v1/auth`)

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/auth/login` | No | Login with email/password |
| POST | `/auth/logout` | Yes | Logout, clear session |
| GET | `/auth/me` | Yes | Get current authenticated user |
| GET | `/auth/tenants` | Yes | List tenants for current user |
| POST | `/auth/switch-tenant` | Yes | Switch active tenant |

#### Example: Get Current User

**Response:**

```json
{
  "user": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "email": "jane.smith@company.co.uk",
    "name": "Jane Smith",
    "emailVerified": true,
    "status": "active",
    "mfaEnabled": false
  },
  "session": {
    "id": "sess_abc123",
    "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "expiresAt": "2026-03-18T12:00:00Z"
  },
  "currentTenant": {
    "id": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Acme Ltd",
    "slug": "acme-ltd",
    "isPrimary": true
  },
  "tenants": [
    {
      "id": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Acme Ltd",
      "slug": "acme-ltd",
      "isPrimary": true
    }
  ]
}
```

#### Example: Switch Tenant

**Request:**

```json
{
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Response:**

```json
{
  "success": true,
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

---

## Core HR Module (`/api/v1/hr`)

### Org Units

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/hr/org-units` | `hr.org_units.read` | List organizational units |
| POST | `/hr/org-units` | `hr.org_units.write` | Create org unit |
| GET | `/hr/org-units/:id` | `hr.org_units.read` | Get org unit by ID |
| PATCH | `/hr/org-units/:id` | `hr.org_units.write` | Update org unit |
| DELETE | `/hr/org-units/:id` | `hr.org_units.write` | Delete org unit |

### Positions

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/hr/positions` | `hr.positions.read` | List positions |
| POST | `/hr/positions` | `hr.positions.write` | Create position |
| GET | `/hr/positions/:id` | `hr.positions.read` | Get position by ID |
| PATCH | `/hr/positions/:id` | `hr.positions.write` | Update position |
| DELETE | `/hr/positions/:id` | `hr.positions.write` | Delete position |

### Employees

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/hr/employees` | `hr.employees.read` | List employees |
| POST | `/hr/employees` | `hr.employees.write` | Create employee |
| GET | `/hr/employees/:id` | `hr.employees.read` | Get employee by ID |
| PATCH | `/hr/employees/:id/personal` | `hr.employees.write` | Update personal info |
| PATCH | `/hr/employees/:id/contract` | `hr.employees.write` | Update contract |
| PATCH | `/hr/employees/:id/position` | `hr.employees.write` | Update position assignment |
| PATCH | `/hr/employees/:id/compensation` | `hr.employees.write` | Update compensation |
| PATCH | `/hr/employees/:id/manager` | `hr.employees.write` | Update reporting line |
| POST | `/hr/employees/:id/status-transition` | `hr.employees.write` | Transition employee status |
| POST | `/hr/employees/:id/terminate` | `hr.employees.terminate` | Terminate employee |
| GET | `/hr/employees/:id/history/:dimension` | `hr.employees.read` | Get effective-dated history |
| GET | `/hr/employees/:id/statutory-notice` | `hr.employees.read` | Calculate statutory notice period (UK ERA 1996 s.86) |

#### Example: Create Org Unit

**Request:**

```json
{
  "code": "ENG-UK",
  "name": "Engineering - United Kingdom",
  "description": "UK-based engineering department",
  "effective_from": "2026-04-01"
}
```

**Response:**

```json
{
  "id": "d4e5f6a7-b8c9-0123-4567-890abcdef012",
  "tenant_id": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "parent_id": null,
  "code": "ENG-UK",
  "name": "Engineering - United Kingdom",
  "description": "UK-based engineering department",
  "level": 0,
  "path": null,
  "manager_position_id": null,
  "cost_center_id": null,
  "is_active": true,
  "effective_from": "2026-04-01",
  "effective_to": null,
  "created_at": "2026-03-17T10:00:00Z",
  "updated_at": "2026-03-17T10:00:00Z"
}
```

#### Example: Create Employee

**Request:**

```json
{
  "personal": {
    "first_name": "Jane",
    "last_name": "Smith",
    "date_of_birth": "1990-06-15",
    "gender": "female",
    "nationality": "GBR"
  },
  "contract": {
    "hire_date": "2026-04-01",
    "contract_type": "permanent",
    "employment_type": "full_time",
    "fte": 1.0,
    "working_hours_per_week": 37.5,
    "probation_end_date": "2026-10-01",
    "notice_period_days": 30
  },
  "position": {
    "position_id": "p1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "org_unit_id": "d4e5f6a7-b8c9-0123-4567-890abcdef012",
    "is_primary": true
  },
  "compensation": {
    "base_salary": 45000,
    "currency": "GBP",
    "pay_frequency": "monthly"
  },
  "manager_id": "m1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Response:**

```json
{
  "id": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "tenant_id": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employee_number": "EMP-001",
  "user_id": null,
  "status": "pending",
  "hire_date": "2026-04-01",
  "termination_date": null,
  "termination_reason": null,
  "tenure_years": null,
  "personal": {
    "first_name": "Jane",
    "last_name": "Smith",
    "middle_name": null,
    "preferred_name": null,
    "full_name": "Jane Smith",
    "display_name": "Jane Smith",
    "date_of_birth": "1990-06-15",
    "gender": "female",
    "marital_status": null,
    "nationality": "GBR",
    "effective_from": "2026-04-01"
  },
  "contract": {
    "contract_type": "permanent",
    "employment_type": "full_time",
    "fte": 1.0,
    "working_hours_per_week": 37.5,
    "probation_end_date": "2026-10-01",
    "notice_period_days": 30,
    "effective_from": "2026-04-01"
  },
  "position": {
    "position_id": "p1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "position_code": "SWE-001",
    "position_title": "Software Engineer",
    "org_unit_id": "d4e5f6a7-b8c9-0123-4567-890abcdef012",
    "org_unit_name": "Engineering - United Kingdom",
    "job_grade": "L5",
    "is_primary": true,
    "effective_from": "2026-04-01"
  },
  "compensation": {
    "base_salary": 45000,
    "currency": "GBP",
    "pay_frequency": "monthly",
    "annual_salary": 45000,
    "effective_from": "2026-04-01"
  },
  "created_at": "2026-03-17T10:00:00Z",
  "updated_at": "2026-03-17T10:00:00Z"
}
```

#### Example: List Employees

**Response:**

```json
{
  "items": [
    {
      "id": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
      "employee_number": "EMP-001",
      "status": "active",
      "hire_date": "2026-04-01",
      "full_name": "Jane Smith",
      "display_name": "Jane Smith",
      "position_title": "Software Engineer",
      "org_unit_name": "Engineering - United Kingdom",
      "manager_name": "John Davies"
    }
  ],
  "nextCursor": "eyJpZCI6ImUxZjJhM2I0In0=",
  "hasMore": true,
  "total": 142
}
```

---

## Time & Attendance Module (`/api/v1/time`)

### Time Events

| Method | Path | Description |
|--------|------|-------------|
| POST | `/time/events` | Record clock in/out event |
| GET | `/time/events` | List time events |
| GET | `/time/events/:id` | Get time event by ID |

### Schedules

| Method | Path | Description |
|--------|------|-------------|
| POST | `/time/schedules` | Create schedule |
| GET | `/time/schedules` | List schedules |
| GET | `/time/schedules/:id` | Get schedule by ID |
| PUT | `/time/schedules/:id` | Update schedule |

### Shifts

| Method | Path | Description |
|--------|------|-------------|
| POST | `/time/shifts` | Create shift |
| GET | `/time/shifts/:id` | Get shift by ID |
| PUT | `/time/shifts/:id` | Update shift |

### Timesheets

| Method | Path | Description |
|--------|------|-------------|
| POST | `/time/timesheets` | Create timesheet |
| GET | `/time/timesheets` | List timesheets |
| GET | `/time/timesheets/:id` | Get timesheet by ID |
| PUT | `/time/timesheets/:id` | Update timesheet lines |
| POST | `/time/timesheets/:id/submit` | Submit timesheet for approval |
| POST | `/time/timesheets/:id/approve` | Approve or reject timesheet |

#### Example: Record Clock In

**Request:**

```json
{
  "employeeId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "eventType": "clock_in",
  "eventTime": "2026-03-17T09:00:00Z",
  "latitude": 51.5074,
  "longitude": -0.1278,
  "isManual": false
}
```

**Response:**

```json
{
  "id": "te1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employeeId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "eventType": "clock_in",
  "eventTime": "2026-03-17T09:00:00Z",
  "deviceId": null,
  "latitude": 51.5074,
  "longitude": -0.1278,
  "isManual": false,
  "sessionId": "s1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "createdAt": "2026-03-17T09:00:01Z"
}
```

#### Example: Create Timesheet

**Request:**

```json
{
  "employeeId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "periodStart": "2026-03-01",
  "periodEnd": "2026-03-31"
}
```

**Response:**

```json
{
  "id": "ts1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employeeId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "periodStart": "2026-03-01",
  "periodEnd": "2026-03-31",
  "status": "draft",
  "totalRegularHours": 0,
  "totalOvertimeHours": 0,
  "submittedAt": null,
  "approvedAt": null,
  "approvedById": null,
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

---

## Absence Module (`/api/v1/absence`)

### Leave Types & Policies

| Method | Path | Description |
|--------|------|-------------|
| GET | `/absence/leave-types` | List leave types |
| POST | `/absence/leave-types` | Create leave type |
| GET | `/absence/leave-types/:id` | Get leave type by ID |
| GET | `/absence/policies` | List leave policies |
| POST | `/absence/policies` | Create leave policy |

### Leave Requests

| Method | Path | Description |
|--------|------|-------------|
| GET | `/absence/requests` | List leave requests |
| POST | `/absence/requests` | Create leave request |
| GET | `/absence/requests/:id` | Get leave request by ID |
| POST | `/absence/requests/:id/submit` | Submit request for approval |
| POST | `/absence/requests/:id/approve` | Approve or reject request |
| DELETE | `/absence/requests/:id` | Cancel leave request |

### Balances

| Method | Path | Description |
|--------|------|-------------|
| GET | `/absence/balances/:employeeId` | Get employee leave balances |

#### Example: Create Leave Type

**Request:**

```json
{
  "code": "ANNUAL",
  "name": "Annual Leave",
  "description": "Statutory annual leave entitlement (5.6 weeks)",
  "isPaid": true,
  "requiresApproval": true,
  "requiresAttachment": false,
  "maxConsecutiveDays": 20,
  "minNoticeDays": 14,
  "color": "#2196F3"
}
```

**Response:**

```json
{
  "id": "lt1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "code": "ANNUAL",
  "name": "Annual Leave",
  "description": "Statutory annual leave entitlement (5.6 weeks)",
  "isPaid": true,
  "requiresApproval": true,
  "requiresAttachment": false,
  "maxConsecutiveDays": 20,
  "minNoticeDays": 14,
  "color": "#2196F3",
  "isActive": true,
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

#### Example: Create Leave Request

**Request:**

```json
{
  "employeeId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "leaveTypeId": "lt1b2c3d-e5f6-7890-abcd-ef1234567890",
  "startDate": "2026-04-14",
  "endDate": "2026-04-18",
  "startHalfDay": false,
  "endHalfDay": false,
  "reason": "Family holiday"
}
```

**Response:**

```json
{
  "id": "lr1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employeeId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "leaveTypeId": "lt1b2c3d-e5f6-7890-abcd-ef1234567890",
  "startDate": "2026-04-14",
  "endDate": "2026-04-18",
  "startHalfDay": false,
  "endHalfDay": false,
  "totalDays": 5,
  "reason": "Family holiday",
  "contactInfo": null,
  "status": "draft",
  "submittedAt": null,
  "approvedAt": null,
  "approvedById": null,
  "rejectionReason": null,
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

#### Example: Get Employee Leave Balances

**Response:**

```json
[
  {
    "id": "lb1b2c3d-e5f6-7890-abcd-ef1234567890",
    "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "employeeId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
    "leaveTypeId": "lt1b2c3d-e5f6-7890-abcd-ef1234567890",
    "leaveTypeName": "Annual Leave",
    "year": 2026,
    "entitled": 28,
    "used": 5,
    "pending": 3,
    "available": 20,
    "carryover": 3,
    "updatedAt": "2026-03-17T10:00:00Z"
  }
]
```

---

## Talent Module (`/api/v1/talent`)

### Goals

| Method | Path | Description |
|--------|------|-------------|
| GET | `/talent/goals` | List goals |
| POST | `/talent/goals` | Create goal |
| GET | `/talent/goals/:id` | Get goal by ID |
| PATCH | `/talent/goals/:id` | Update goal |
| DELETE | `/talent/goals/:id` | Delete goal |

### Review Cycles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/talent/review-cycles` | List review cycles |
| POST | `/talent/review-cycles` | Create review cycle |
| GET | `/talent/review-cycles/:id` | Get review cycle by ID |

### Reviews

| Method | Path | Description |
|--------|------|-------------|
| GET | `/talent/reviews` | List reviews |
| POST | `/talent/reviews` | Create review |
| GET | `/talent/reviews/:id` | Get review by ID |
| POST | `/talent/reviews/:id/self-review` | Submit self review |
| POST | `/talent/reviews/:id/manager-review` | Submit manager review |

### Competencies

| Method | Path | Description |
|--------|------|-------------|
| GET | `/talent/competencies` | List competencies |
| POST | `/talent/competencies` | Create competency |
| GET | `/talent/competencies/:id` | Get competency by ID |

#### Example: Create Goal

**Request:**

```json
{
  "employeeId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "title": "Complete AWS Solutions Architect certification",
  "description": "Obtain AWS SAA-C03 certification to support cloud migration programme",
  "category": "professional_development",
  "weight": 25,
  "targetDate": "2026-09-30",
  "metrics": [
    {
      "name": "Practice exam score",
      "target": "85",
      "unit": "percent"
    }
  ]
}
```

**Response:**

```json
{
  "id": "g1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employeeId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "title": "Complete AWS Solutions Architect certification",
  "description": "Obtain AWS SAA-C03 certification to support cloud migration programme",
  "category": "professional_development",
  "weight": 25,
  "targetDate": "2026-09-30",
  "status": "draft",
  "progress": 0,
  "metrics": [
    {
      "name": "Practice exam score",
      "target": "85",
      "unit": "percent"
    }
  ],
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

#### Example: Create Review Cycle

**Request:**

```json
{
  "name": "H1 2026 Performance Review",
  "description": "First half 2026 performance review cycle",
  "periodStart": "2026-01-01",
  "periodEnd": "2026-06-30",
  "selfReviewDeadline": "2026-07-14",
  "managerReviewDeadline": "2026-07-28",
  "calibrationDeadline": "2026-08-15"
}
```

**Response:**

```json
{
  "id": "rc1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "H1 2026 Performance Review",
  "description": "First half 2026 performance review cycle",
  "periodStart": "2026-01-01",
  "periodEnd": "2026-06-30",
  "selfReviewDeadline": "2026-07-14",
  "managerReviewDeadline": "2026-07-28",
  "calibrationDeadline": "2026-08-15",
  "status": "draft",
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

---

## LMS Module (`/api/v1/lms`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/lms/courses` | List courses |
| POST | `/lms/courses` | Create course |
| GET | `/lms/courses/:id` | Get course by ID |
| GET | `/lms/enrollments` | List enrollments |
| POST | `/lms/enrollments` | Create enrollment |
| POST | `/lms/enrollments/:id/start` | Start course |
| POST | `/lms/enrollments/:id/complete` | Complete course |
| GET | `/lms/my-learning` | Get current user's learning |

#### Example: Create Course

**Request:**

```json
{
  "title": "GDPR Awareness Training",
  "description": "Mandatory data protection training for all employees",
  "category": "Compliance",
  "durationMinutes": 45,
  "contentType": "video",
  "contentUrl": "https://lms.staffora.co.uk/courses/gdpr-awareness",
  "passingScore": 80,
  "isRequired": true,
  "tags": ["gdpr", "compliance", "mandatory"]
}
```

**Response:**

```json
{
  "id": "c1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "GDPR Awareness Training",
  "description": "Mandatory data protection training for all employees",
  "category": "Compliance",
  "durationMinutes": 45,
  "contentType": "video",
  "contentUrl": "https://lms.staffora.co.uk/courses/gdpr-awareness",
  "thumbnailUrl": null,
  "passingScore": 80,
  "isRequired": true,
  "status": "draft",
  "enrollmentCount": 0,
  "completionCount": 0,
  "createdBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

#### Example: Create Enrollment

**Request:**

```json
{
  "courseId": "c1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employeeId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "dueDate": "2026-04-30"
}
```

**Response:**

```json
{
  "id": "en1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "courseId": "c1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employeeId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "status": "enrolled",
  "enrolledAt": "2026-03-17T10:00:00Z",
  "startedAt": null,
  "completedAt": null,
  "dueDate": "2026-04-30",
  "progress": 0,
  "score": null,
  "assignedBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "courseTitle": "GDPR Awareness Training",
  "employeeName": "Jane Smith",
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

---

## Cases Module (`/api/v1/cases`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cases/` | List cases |
| POST | `/cases/` | Create case |
| GET | `/cases/:id` | Get case by ID |
| PATCH | `/cases/:id` | Update case (status transition) |
| GET | `/cases/:id/comments` | Get case comments |
| POST | `/cases/:id/comments` | Add comment to case |
| GET | `/cases/my-cases` | Get current user's cases |

#### Example: Create Case

**Request:**

```json
{
  "requesterId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "category": "payroll",
  "subject": "Incorrect overtime calculation for March",
  "description": "My overtime hours for the week of 10th March were not included in my payslip. I worked 8 extra hours as approved by my line manager.",
  "priority": "high",
  "tags": ["payroll", "overtime"]
}
```

**Response:**

```json
{
  "id": "cs1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "caseNumber": "CASE-2026-0042",
  "requesterId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "requesterName": "Jane Smith",
  "category": "payroll",
  "subject": "Incorrect overtime calculation for March",
  "description": "My overtime hours for the week of 10th March were not included in my payslip. I worked 8 extra hours as approved by my line manager.",
  "priority": "high",
  "status": "open",
  "assigneeId": null,
  "assigneeName": null,
  "resolution": null,
  "dueDate": null,
  "resolvedAt": null,
  "closedAt": null,
  "firstResponseAt": null,
  "slaBreached": false,
  "tags": ["payroll", "overtime"],
  "createdBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

#### Example: Add Comment to Case

**Request:**

```json
{
  "content": "I have reviewed your timesheet records and can confirm the 8 hours are missing. This will be corrected in the next pay run.",
  "isInternal": false
}
```

**Response:**

```json
{
  "id": "cm1b2c3d-e5f6-7890-abcd-ef1234567890",
  "caseId": "cs1b2c3d-e5f6-7890-abcd-ef1234567890",
  "authorId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "authorName": "HR Administrator",
  "content": "I have reviewed your timesheet records and can confirm the 8 hours are missing. This will be corrected in the next pay run.",
  "isInternal": false,
  "createdAt": "2026-03-17T11:30:00Z",
  "updatedAt": "2026-03-17T11:30:00Z"
}
```

---

## Onboarding Module (`/api/v1/onboarding`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/onboarding/checklists` | List onboarding checklists |
| POST | `/onboarding/checklists` | Create checklist |
| GET | `/onboarding/instances` | List onboarding instances |
| POST | `/onboarding/instances` | Start onboarding for employee |
| GET | `/onboarding/instances/:id` | Get onboarding instance |
| POST | `/onboarding/instances/:id/tasks/:taskId/complete` | Complete task |
| GET | `/onboarding/my-onboarding` | Get current user's onboarding |

#### Example: Create Onboarding Template

**Request:**

```json
{
  "name": "UK Engineering New Starter",
  "description": "Standard onboarding checklist for UK engineering hires",
  "isDefault": false,
  "tasks": [
    {
      "name": "Complete right to work check",
      "category": "compliance",
      "assigneeType": "hr",
      "daysFromStart": 0,
      "daysToComplete": 1,
      "required": true,
      "order": 1
    },
    {
      "name": "Set up development environment",
      "category": "equipment",
      "assigneeType": "it",
      "daysFromStart": 0,
      "daysToComplete": 2,
      "required": true,
      "order": 2
    },
    {
      "name": "Meet the team introductions",
      "category": "introduction",
      "assigneeType": "buddy",
      "daysFromStart": 1,
      "daysToComplete": 5,
      "required": false,
      "order": 3
    }
  ]
}
```

**Response:**

```json
{
  "id": "ot1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "UK Engineering New Starter",
  "description": "Standard onboarding checklist for UK engineering hires",
  "departmentId": null,
  "positionId": null,
  "isDefault": false,
  "status": "active",
  "taskCount": 3,
  "createdBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

#### Example: Start Onboarding for Employee

**Request:**

```json
{
  "employeeId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "templateId": "ot1b2c3d-e5f6-7890-abcd-ef1234567890",
  "startDate": "2026-04-01",
  "buddyId": "b1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "notes": "New graduate starter - may need extra support"
}
```

**Response:**

```json
{
  "id": "oi1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employeeId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "employeeName": "Jane Smith",
  "templateId": "ot1b2c3d-e5f6-7890-abcd-ef1234567890",
  "templateName": "UK Engineering New Starter",
  "status": "not_started",
  "startDate": "2026-04-01",
  "targetCompletionDate": "2026-04-08",
  "completedAt": null,
  "buddyId": "b1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "buddyName": "Tom Williams",
  "managerId": null,
  "progress": 0,
  "taskCount": 3,
  "completedTaskCount": 0,
  "notes": "New graduate starter - may need extra support",
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

---

## Benefits Module (`/api/v1/benefits`)

### Carriers & Plans

| Method | Path | Description |
|--------|------|-------------|
| GET | `/benefits/carriers` | List benefit carriers |
| POST | `/benefits/carriers` | Create carrier |
| GET | `/benefits/plans` | List benefit plans |
| POST | `/benefits/plans` | Create plan |

### Enrollments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/benefits/enrollments` | List enrollments |
| POST | `/benefits/enrollments` | Create enrollment |
| GET | `/benefits/enrollments/:id` | Get enrollment |

### Dependents & Life Events

| Method | Path | Description |
|--------|------|-------------|
| GET | `/benefits/dependents` | List dependents |
| POST | `/benefits/dependents` | Add dependent |
| GET | `/benefits/life-events` | List life events |
| POST | `/benefits/life-events` | Create life event |

#### Example: Create Benefit Plan

**Request:**

```json
{
  "name": "Private Medical Insurance - Standard",
  "plan_code": "PMI-STD",
  "category": "health",
  "description": "Standard private medical insurance with AXA Health",
  "contribution_type": "shared",
  "effective_from": "2026-04-01",
  "waiting_period_days": 90,
  "costs": [
    {
      "coverage_level": "employee_only",
      "employee_cost": 45.00,
      "employer_cost": 85.00
    },
    {
      "coverage_level": "family",
      "employee_cost": 120.00,
      "employer_cost": 85.00
    }
  ]
}
```

**Response:**

```json
{
  "id": "bp1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenant_id": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Private Medical Insurance - Standard",
  "plan_code": "PMI-STD",
  "category": "health",
  "carrier_id": null,
  "carrier_name": null,
  "description": "Standard private medical insurance with AXA Health",
  "contribution_type": "shared",
  "effective_from": "2026-04-01",
  "effective_to": null,
  "waiting_period_days": 90,
  "is_active": true,
  "costs": [
    {
      "coverage_level": "employee_only",
      "employee_cost": 45.00,
      "employer_cost": 85.00,
      "total_cost": 130.00
    },
    {
      "coverage_level": "family",
      "employee_cost": 120.00,
      "employer_cost": 85.00,
      "total_cost": 205.00
    }
  ],
  "created_at": "2026-03-17T10:00:00Z",
  "updated_at": "2026-03-17T10:00:00Z"
}
```

#### Example: Create Enrollment

**Request:**

```json
{
  "employee_id": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "plan_id": "bp1b2c3d-e5f6-7890-abcd-ef1234567890",
  "coverage_level": "employee_only",
  "effective_from": "2026-07-01",
  "enrollment_type": "new_hire"
}
```

**Response:**

```json
{
  "id": "be1b2c3d-e5f6-7890-abcd-ef1234567890",
  "employee_id": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "plan_id": "bp1b2c3d-e5f6-7890-abcd-ef1234567890",
  "plan_name": "Private Medical Insurance - Standard",
  "plan_category": "health",
  "coverage_level": "employee_only",
  "status": "active",
  "effective_from": "2026-07-01",
  "effective_to": null,
  "employee_contribution": 45.00,
  "employer_contribution": 85.00,
  "total_contribution": 130.00,
  "covered_dependents": [],
  "enrollment_type": "new_hire",
  "created_at": "2026-03-17T10:00:00Z"
}
```

---

## Documents Module (`/api/v1/documents`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/documents/` | List documents |
| POST | `/documents/` | Create document |
| GET | `/documents/:id` | Get document by ID |
| PUT | `/documents/:id` | Update document |
| DELETE | `/documents/:id` | Delete document |
| GET | `/documents/:id/download-url` | Get download URL |
| GET | `/documents/upload-url` | Get upload URL |
| GET | `/documents/expiring` | Get expiring documents |
| GET | `/documents/:id/versions` | List document versions |
| POST | `/documents/:id/versions` | Create new version |
| GET | `/documents/my-summary` | Get self-service document summary |

#### Example: Create Document

**Request:**

```json
{
  "employee_id": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "category": "contract",
  "name": "Employment Contract - Jane Smith",
  "description": "Signed employment contract for permanent position",
  "file_name": "jane-smith-contract-2026.pdf",
  "file_size": 245760,
  "mime_type": "application/pdf",
  "expires_at": "2027-04-01",
  "tags": ["contract", "employment", "signed"]
}
```

**Response:**

```json
{
  "id": "dc1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenant_id": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employee_id": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "employee_name": "Jane Smith",
  "category": "contract",
  "name": "Employment Contract - Jane Smith",
  "description": "Signed employment contract for permanent position",
  "file_key": "docs/t1b2c3d4/contract/2026/jane-smith-contract-2026.pdf",
  "file_name": "jane-smith-contract-2026.pdf",
  "file_size": 245760,
  "mime_type": "application/pdf",
  "version": 1,
  "status": "active",
  "expires_at": "2027-04-01",
  "tags": ["contract", "employment", "signed"],
  "uploaded_by": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "uploaded_by_name": "HR Administrator",
  "download_url": "https://storage.staffora.co.uk/docs/...",
  "created_at": "2026-03-17T10:00:00Z",
  "updated_at": "2026-03-17T10:00:00Z"
}
```

---

## Succession Module (`/api/v1/succession`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/succession/plans` | List succession plans |
| POST | `/succession/plans` | Create succession plan |
| GET | `/succession/plans/:id` | Get plan by ID |
| PUT | `/succession/plans/:id` | Update plan |
| DELETE | `/succession/plans/:id` | Delete plan |
| GET | `/succession/plans/:id/candidates` | List plan candidates |
| POST | `/succession/candidates` | Add candidate to plan |
| GET | `/succession/candidates/:id` | Get candidate |
| PUT | `/succession/candidates/:id` | Update candidate |
| DELETE | `/succession/candidates/:id` | Remove candidate |
| GET | `/succession/pipeline` | Get succession pipeline |
| GET | `/succession/pipeline/stats` | Get pipeline statistics |
| GET | `/succession/gaps` | Get succession gaps |

#### Example: Create Succession Plan

**Request:**

```json
{
  "position_id": "p1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "is_critical_role": true,
  "criticality_reason": "Single point of failure for UK regulatory compliance expertise",
  "risk_level": "high",
  "incumbent_retirement_risk": false,
  "incumbent_flight_risk": true,
  "market_scarcity": true,
  "notes": "Limited pool of qualified UK compliance specialists",
  "next_review_date": "2026-06-30"
}
```

**Response:**

```json
{
  "id": "sp1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenant_id": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "position_id": "p1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "position_title": "Head of Compliance",
  "org_unit_name": "Legal & Compliance",
  "incumbent_name": "Sarah Thompson",
  "is_critical_role": true,
  "criticality_reason": "Single point of failure for UK regulatory compliance expertise",
  "risk_level": "high",
  "incumbent_retirement_risk": false,
  "incumbent_flight_risk": true,
  "market_scarcity": true,
  "notes": "Limited pool of qualified UK compliance specialists",
  "candidate_count": 0,
  "ready_now_count": 0,
  "last_reviewed_at": null,
  "next_review_date": "2026-06-30",
  "is_active": true,
  "created_at": "2026-03-17T10:00:00Z",
  "updated_at": "2026-03-17T10:00:00Z"
}
```

#### Example: Add Succession Candidate

**Request:**

```json
{
  "plan_id": "sp1b2c3d-e5f6-7890-abcd-ef1234567890",
  "employee_id": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "readiness": "ready_1_year",
  "ranking": 1,
  "assessment_notes": "Strong compliance background, needs leadership development",
  "strengths": ["Regulatory knowledge", "Attention to detail", "Stakeholder management"],
  "development_areas": ["People management", "Strategic planning"]
}
```

**Response:**

```json
{
  "id": "sc1b2c3d-e5f6-7890-abcd-ef1234567890",
  "plan_id": "sp1b2c3d-e5f6-7890-abcd-ef1234567890",
  "employee_id": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "employee_name": "Jane Smith",
  "current_position": "Senior Compliance Analyst",
  "current_department": "Legal & Compliance",
  "readiness": "ready_1_year",
  "ranking": 1,
  "assessment_notes": "Strong compliance background, needs leadership development",
  "strengths": ["Regulatory knowledge", "Attention to detail", "Stakeholder management"],
  "development_areas": ["People management", "Strategic planning"],
  "is_active": true,
  "created_at": "2026-03-17T10:00:00Z",
  "updated_at": "2026-03-17T10:00:00Z"
}
```

---

## Analytics Module (`/api/v1/analytics`)

### Dashboards

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/dashboard/executive` | Executive dashboard |
| GET | `/analytics/dashboard/manager` | Manager dashboard |

### Headcount

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/headcount/summary` | Headcount summary |
| GET | `/analytics/headcount/by-department` | Headcount by department |
| GET | `/analytics/headcount/trend` | Headcount trend over time |

### Turnover

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/turnover/summary` | Turnover summary |
| GET | `/analytics/turnover/by-department` | Turnover by department |
| GET | `/analytics/turnover/by-reason` | Turnover by reason |

### Other Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/attendance/summary` | Attendance summary |
| GET | `/analytics/leave/summary` | Leave summary |
| GET | `/analytics/leave/by-type` | Leave by type |
| GET | `/analytics/recruitment/summary` | Recruitment summary |
| GET | `/analytics/reports` | Standard reports catalog |

#### Example: Executive Dashboard

**Response:**

```json
{
  "headcount": {
    "total_employees": 342,
    "active_employees": 325,
    "on_leave_employees": 12,
    "pending_employees": 5,
    "terminated_employees": 0,
    "as_of_date": "2026-03-17"
  },
  "turnover": {
    "rate": 8.2,
    "trend": "down",
    "change_percentage": -1.5
  },
  "attendance": {
    "rate": 96.4,
    "trend": "stable"
  },
  "leave": {
    "pending_requests": 14,
    "avg_utilization": 62.3
  },
  "recruitment": {
    "open_positions": 8,
    "avg_time_to_fill": 32
  }
}
```

#### Example: Headcount Summary

**Response:**

```json
{
  "total_employees": 342,
  "active_employees": 325,
  "on_leave_employees": 12,
  "pending_employees": 5,
  "terminated_employees": 0,
  "as_of_date": "2026-03-17"
}
```

#### Example: Turnover Summary

**Query:** `?start_date=2026-01-01&end_date=2026-03-31`

**Response:**

```json
{
  "total_terminations": 7,
  "voluntary_terminations": 5,
  "involuntary_terminations": 2,
  "turnover_rate": 8.2,
  "avg_tenure_months": 18,
  "period": {
    "start_date": "2026-01-01",
    "end_date": "2026-03-31"
  }
}
```

---

## Competencies Module (`/api/v1/competencies`)

### Competency Framework

| Method | Path | Description |
|--------|------|-------------|
| GET | `/competencies/` | List competencies |
| POST | `/competencies/` | Create competency |
| GET | `/competencies/:id` | Get competency by ID |
| PATCH | `/competencies/:id` | Update competency |
| DELETE | `/competencies/:id` | Delete competency |

### Job Competencies

| Method | Path | Description |
|--------|------|-------------|
| GET | `/competencies/jobs/:jobId` | List competencies for job |
| POST | `/competencies/jobs` | Add competency to job |
| PATCH | `/competencies/jobs/:id` | Update job competency |
| DELETE | `/competencies/jobs/:id` | Remove job competency |

### Employee Assessments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/competencies/employees/:employeeId` | List employee competencies |
| GET | `/competencies/employees/:employeeId/gaps` | Get competency gaps |
| POST | `/competencies/employees` | Assess employee competency |
| PATCH | `/competencies/employees/assessments/:id` | Update assessment |
| GET | `/competencies/due-assessments` | Get assessments due |
| GET | `/competencies/team/:managerId` | Get team competency overview |

#### Example: Create Competency

**Request:**

```json
{
  "code": "TECH-CLOUD",
  "name": "Cloud Infrastructure",
  "category": "technical",
  "description": "Ability to design, deploy, and manage cloud infrastructure solutions",
  "levels": [
    {
      "level": 1,
      "name": "Foundation",
      "description": "Basic understanding of cloud concepts and services"
    },
    {
      "level": 3,
      "name": "Proficient",
      "description": "Can independently design and implement cloud solutions"
    },
    {
      "level": 5,
      "name": "Expert",
      "description": "Leads cloud architecture decisions and mentors others"
    }
  ],
  "behavioral_indicators": [
    "Evaluates cloud services for cost and performance",
    "Implements infrastructure as code practices",
    "Ensures compliance with security standards"
  ]
}
```

**Response:**

```json
{
  "id": "cp1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenant_id": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "code": "TECH-CLOUD",
  "name": "Cloud Infrastructure",
  "category": "technical",
  "description": "Ability to design, deploy, and manage cloud infrastructure solutions",
  "is_active": true,
  "created_at": "2026-03-17T10:00:00Z",
  "updated_at": "2026-03-17T10:00:00Z"
}
```

#### Example: Assess Employee Competency

**Request:**

```json
{
  "employee_id": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "competency_id": "cp1b2c3d-e5f6-7890-abcd-ef1234567890",
  "current_level": 2,
  "target_level": 4,
  "self_assessment_level": 3,
  "assessment_notes": "Good foundational knowledge, needs hands-on project experience",
  "next_assessment_due": "2026-09-17"
}
```

**Response:**

```json
{
  "id": "ec1b2c3d-e5f6-7890-abcd-ef1234567890",
  "employee_id": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "competency_id": "cp1b2c3d-e5f6-7890-abcd-ef1234567890",
  "current_level": 2,
  "target_level": 4,
  "self_assessment_level": 3,
  "gap": 2,
  "assessment_notes": "Good foundational knowledge, needs hands-on project experience",
  "next_assessment_due": "2026-09-17",
  "created_at": "2026-03-17T10:00:00Z",
  "updated_at": "2026-03-17T10:00:00Z"
}
```

---

## Recruitment Module (`/api/v1/recruitment`)

### Requisitions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/recruitment/requisitions` | List requisitions |
| POST | `/recruitment/requisitions` | Create requisition |
| GET | `/recruitment/requisitions/:id` | Get requisition by ID |
| PATCH | `/recruitment/requisitions/:id` | Update requisition |
| POST | `/recruitment/requisitions/:id/open` | Open requisition |
| POST | `/recruitment/requisitions/:id/close` | Close requisition |
| POST | `/recruitment/requisitions/:id/cancel` | Cancel requisition |
| GET | `/recruitment/requisitions/:id/pipeline` | Get candidate pipeline |
| GET | `/recruitment/requisitions/stats` | Get requisition statistics |

### Candidates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/recruitment/candidates` | List candidates |
| POST | `/recruitment/candidates` | Create candidate |
| GET | `/recruitment/candidates/:id` | Get candidate by ID |
| PATCH | `/recruitment/candidates/:id` | Update candidate |
| POST | `/recruitment/candidates/:id/advance` | Advance candidate stage |
| GET | `/recruitment/candidates/stats` | Get candidate statistics |

#### Example: Create Requisition

**Request:**

```json
{
  "title": "Senior Software Engineer",
  "positionId": "p1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "orgUnitId": "d4e5f6a7-b8c9-0123-4567-890abcdef012",
  "hiringManagerId": "m1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employmentType": "full_time",
  "openings": 2,
  "priority": 4,
  "jobDescription": "We are looking for an experienced senior engineer to join our UK engineering team...",
  "requirements": {
    "experienceYears": 5,
    "education": "BSc Computer Science or equivalent",
    "skills": ["TypeScript", "React", "PostgreSQL", "AWS"],
    "certifications": ["AWS Solutions Architect"],
    "niceToHave": ["Kubernetes", "GraphQL"]
  },
  "targetStartDate": "2026-06-01",
  "deadline": "2026-05-01",
  "location": "London, UK"
}
```

**Response:**

```json
{
  "id": "rq1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "Senior Software Engineer",
  "positionId": "p1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "orgUnitId": "d4e5f6a7-b8c9-0123-4567-890abcdef012",
  "hiringManagerId": "m1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employmentType": "full_time",
  "openings": 2,
  "priority": 4,
  "status": "draft",
  "targetStartDate": "2026-06-01",
  "deadline": "2026-05-01",
  "location": "London, UK",
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

#### Example: Create Candidate

**Request:**

```json
{
  "requisitionId": "rq1b2c3d-e5f6-7890-abcd-ef1234567890",
  "email": "alex.johnson@example.co.uk",
  "firstName": "Alex",
  "lastName": "Johnson",
  "phone": "+44 7700 900123",
  "source": "linkedin",
  "resumeUrl": "https://storage.staffora.co.uk/resumes/alex-johnson-cv.pdf",
  "linkedinUrl": "https://linkedin.com/in/alexjohnson",
  "rating": 4
}
```

**Response:**

```json
{
  "id": "cd1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "requisitionId": "rq1b2c3d-e5f6-7890-abcd-ef1234567890",
  "email": "alex.johnson@example.co.uk",
  "firstName": "Alex",
  "lastName": "Johnson",
  "phone": "+44 7700 900123",
  "source": "linkedin",
  "currentStage": "applied",
  "rating": 4,
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

---

## Workflows Module (`/api/v1/workflows`)

### Definitions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/workflows/definitions` | List workflow definitions |
| POST | `/workflows/definitions` | Create definition |
| GET | `/workflows/definitions/:id` | Get definition by ID |
| PATCH | `/workflows/definitions/:id` | Update definition |
| POST | `/workflows/definitions/:id/activate` | Activate definition |

### Instances

| Method | Path | Description |
|--------|------|-------------|
| GET | `/workflows/instances` | List workflow instances |
| POST | `/workflows/instances` | Start workflow |
| GET | `/workflows/instances/:id` | Get instance by ID |
| GET | `/workflows/instances/:id/steps` | Get instance steps |
| POST | `/workflows/instances/:id/cancel` | Cancel workflow |

### Steps & Approvals

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workflows/steps/:stepId/process` | Process step (approve/reject) |
| POST | `/workflows/steps/:stepId/reassign` | Reassign step |
| GET | `/workflows/my-approvals` | Get pending approvals |

#### Example: Create Workflow Definition

**Request:**

```json
{
  "code": "LEAVE-APPROVAL",
  "name": "Leave Request Approval",
  "description": "Standard approval workflow for leave requests",
  "category": "hr",
  "triggerType": "event",
  "triggerConfig": {
    "eventType": "absence.leave_request.submitted"
  },
  "steps": [
    {
      "stepKey": "manager_approval",
      "stepType": "approval",
      "name": "Manager Approval",
      "description": "Direct line manager reviews and approves/rejects the leave request",
      "assigneeType": "manager",
      "timeoutHours": 48,
      "nextSteps": [
        { "stepKey": "notify_employee" }
      ]
    },
    {
      "stepKey": "notify_employee",
      "stepType": "notification",
      "name": "Notify Employee",
      "description": "Send notification to employee about the decision",
      "assigneeType": "dynamic"
    }
  ]
}
```

**Response:**

```json
{
  "id": "wd1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "code": "LEAVE-APPROVAL",
  "name": "Leave Request Approval",
  "description": "Standard approval workflow for leave requests",
  "category": "hr",
  "triggerType": "event",
  "triggerConfig": {
    "eventType": "absence.leave_request.submitted"
  },
  "steps": [],
  "status": "draft",
  "version": 1,
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

#### Example: Start Workflow Instance

**Request:**

```json
{
  "workflowDefinitionId": "wd1b2c3d-e5f6-7890-abcd-ef1234567890",
  "entityType": "leave_request",
  "entityId": "lr1b2c3d-e5f6-7890-abcd-ef1234567890",
  "initiatorId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "contextData": {
    "leaveType": "Annual Leave",
    "totalDays": 5,
    "startDate": "2026-04-14"
  }
}
```

**Response:**

```json
{
  "id": "wi1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenantId": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "workflowDefinitionId": "wd1b2c3d-e5f6-7890-abcd-ef1234567890",
  "workflowName": "Leave Request Approval",
  "entityType": "leave_request",
  "entityId": "lr1b2c3d-e5f6-7890-abcd-ef1234567890",
  "initiatorId": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "status": "in_progress",
  "currentStepKey": "manager_approval",
  "contextData": {
    "leaveType": "Annual Leave",
    "totalDays": 5,
    "startDate": "2026-04-14"
  },
  "startedAt": "2026-03-17T10:00:00Z",
  "completedAt": null,
  "createdAt": "2026-03-17T10:00:00Z",
  "updatedAt": "2026-03-17T10:00:00Z"
}
```

---

## Security Module (`/api/v1/security`)

### Permissions & Roles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/security/my-permissions` | Get current user's permissions |
| GET | `/security/permissions` | List permission catalog |
| GET | `/security/roles` | List roles |
| POST | `/security/roles` | Create role |
| PUT | `/security/roles/:id` | Update role |
| DELETE | `/security/roles/:id` | Delete role |
| GET | `/security/roles/:id/permissions` | Get role permissions |
| POST | `/security/roles/:id/permissions` | Grant permission to role |
| DELETE | `/security/roles/:id/permissions` | Revoke permission from role |

### User Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/security/users` | List tenant users |
| POST | `/security/users/:id/roles` | Assign role to user |
| DELETE | `/security/role-assignments/:id` | Revoke role assignment |
| GET | `/security/users/:id/role-assignments` | List user role assignments |

### Audit

| Method | Path | Description |
|--------|------|-------------|
| GET | `/security/audit-log` | Query audit log entries |

#### Example: Create Role

**Request:**

```json
{
  "name": "Payroll Manager",
  "description": "Can manage payroll runs, view employee compensation, and approve timesheets",
  "portalType": "admin",
  "permissions": {
    "payroll.runs.read": true,
    "payroll.runs.write": true,
    "payroll.runs.approve": true,
    "hr.compensation.read": true,
    "time.timesheets.approve": true
  }
}
```

**Response:**

```json
{
  "id": "rl1b2c3d-e5f6-7890-abcd-ef1234567890",
  "name": "Payroll Manager",
  "description": "Can manage payroll runs, view employee compensation, and approve timesheets",
  "portalType": "admin",
  "isSystem": false,
  "permissions": {
    "payroll.runs.read": true,
    "payroll.runs.write": true,
    "payroll.runs.approve": true,
    "hr.compensation.read": true,
    "time.timesheets.approve": true
  }
}
```

#### Example: Update Field Permissions (Bulk)

**Request:** `PUT /security/roles/:roleId/field-permissions`

```json
{
  "permissions": [
    {
      "fieldId": "f1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "permission": "view"
    },
    {
      "fieldId": "f2b2c3d4-e5f6-7890-abcd-ef1234567890",
      "permission": "hidden"
    }
  ]
}
```

**Response:**

```json
{
  "updated": 2
}
```

---

## Portal Module (`/api/v1/portal`)

Self-service endpoints for logged-in employees:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/portal/me` | Get my profile |
| GET | `/portal/my-team` | Get my direct reports |
| GET | `/portal/tasks` | Get my pending tasks |
| GET | `/portal/approvals` | Get my pending approvals |
| GET | `/portal/dashboard` | Get dashboard summary |

#### Example: Get My Profile

**Response:**

```json
{
  "id": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "employeeNumber": "EMP-001",
  "firstName": "Jane",
  "lastName": "Smith",
  "preferredName": null,
  "photoUrl": null,
  "jobTitle": "Software Engineer",
  "department": "Engineering - United Kingdom",
  "status": "active",
  "email": "jane.smith@company.co.uk",
  "hireDate": "2026-04-01"
}
```

#### Example: Get My Pending Approvals

**Response:**

```json
[
  {
    "id": "lr1b2c3d-e5f6-7890-abcd-ef1234567890",
    "type": "leave_request",
    "employeeId": "e2f3a4b5-c6d7-8901-abcd-ef2345678901",
    "employeeName": "Tom Williams",
    "employeeNumber": "EMP-042",
    "summary": "Annual Leave: 14 Apr - 18 Apr 2026 (5 days)",
    "submittedAt": "2026-03-15T09:30:00Z",
    "dueDate": "2026-03-20T09:30:00Z",
    "priority": "medium"
  }
]
```

---

## Tenant Module (`/api/v1/tenant`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tenant/current` | Get current tenant info |
| GET | `/tenant/settings` | Get tenant settings |

#### Example: Get Current Tenant

**Response:**

```json
{
  "id": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Acme Ltd",
  "slug": "acme-ltd",
  "domain": "acme.staffora.co.uk",
  "status": "active",
  "settings": {
    "timezone": "Europe/London",
    "dateFormat": "DD/MM/YYYY",
    "currency": "GBP",
    "weekStartDay": "monday",
    "workingDaysPerWeek": 5,
    "defaultWorkingHours": 37.5,
    "financialYearStart": "04-06"
  },
  "createdAt": "2025-01-15T09:00:00Z"
}
```

---

## Dashboard Module (`/api/v1/dashboard`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/admin/stats` | Admin dashboard statistics |

#### Example: Admin Dashboard Statistics

**Response:**

```json
{
  "totalEmployees": 342,
  "activeEmployees": 325,
  "departments": 12,
  "openPositions": 8,
  "pendingWorkflows": 5,
  "pendingApprovals": 14
}
```

---

## System Module (`/api/v1/system`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/system/health` | System health check |

#### Example: System Health Check

**Response:**

```json
{
  "status": "healthy",
  "services": [
    {
      "name": "database",
      "status": "healthy",
      "latency": 2.3
    },
    {
      "name": "redis",
      "status": "healthy",
      "latency": 0.8
    }
  ]
}
```

---

# Additional Module APIs

The following 52 modules provide extended functionality across UK compliance, GDPR, payroll, HR operations, learning, notifications, reporting, and the client portal.

---

## UK Compliance

---

### Right to Work (`/api/v1/right-to-work`)

UK right-to-work verification and document management for Immigration, Asylum and Nationality Act 2006 compliance.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/right-to-work/compliance` | Yes | Get compliance dashboard |
| GET | `/right-to-work/expiring` | Yes | List expiring RTW checks |
| GET | `/right-to-work/checks` | Yes | List RTW checks with filters |
| POST | `/right-to-work/checks` | Yes | Create a new RTW check |
| GET | `/right-to-work/checks/:id` | Yes | Get RTW check by ID |
| PATCH | `/right-to-work/checks/:id` | Yes | Update RTW check |
| POST | `/right-to-work/checks/:id/verify` | Yes | Verify RTW check |
| POST | `/right-to-work/checks/:id/fail` | Yes | Fail RTW check |
| GET | `/right-to-work/checks/:id/documents` | Yes | List documents for check |
| POST | `/right-to-work/checks/:id/documents` | Yes | Add document to check |
| DELETE | `/right-to-work/checks/:id/documents/:documentId` | Yes | Remove document from check |
| GET | `/right-to-work/employees/:employeeId/status` | Yes | Get employee RTW status |

#### Example: Create RTW Check

**Request:**

```json
{
  "employee_id": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "check_type": "manual_list_a",
  "check_date": "2026-03-17",
  "document_type": "UK Passport",
  "document_reference": "533410987",
  "document_expiry_date": "2032-08-15",
  "notes": "Original passport verified in person"
}
```

**Response:**

```json
{
  "id": "rw1b2c3d-e5f6-7890-abcd-ef1234567890",
  "tenant_id": "t1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employee_id": "e1f2a3b4-c5d6-7890-abcd-ef1234567890",
  "check_type": "manual_list_a",
  "check_date": "2026-03-17",
  "status": "pending",
  "document_type": "UK Passport",
  "document_reference": "533410987",
  "document_expiry_date": "2032-08-15",
  "restriction_details": null,
  "notes": "Original passport verified in person",
  "verified_by": null,
  "verified_at": null,
  "follow_up_date": null,
  "created_at": "2026-03-17T10:00:00Z",
  "updated_at": "2026-03-17T10:00:00Z"
}
```

---

### SSP (`/api/v1/ssp`)

Statutory Sick Pay management per Social Security Contributions and Benefits Act 1992.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/ssp/records` | Yes | List SSP records |
| GET | `/ssp/records/:id` | Yes | Get SSP record detail |
| POST | `/ssp/records` | Yes | Start new SSP period |
| PATCH | `/ssp/records/:id` | Yes | Update SSP record |
| POST | `/ssp/records/:id/end` | Yes | End SSP period |
| GET | `/ssp/employees/:employeeId/entitlement` | Yes | Check remaining SSP entitlement |
| GET | `/ssp/employees/:employeeId/eligibility` | Yes | Check SSP eligibility |

---

### Statutory Leave (`/api/v1/statutory-leave`)

UK statutory leave management for maternity, paternity, shared parental, and adoption leave.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/statutory-leave/` | Yes | List statutory leave records |
| POST | `/statutory-leave/` | Yes | Create statutory leave record |
| GET | `/statutory-leave/eligibility/:employeeId` | Yes | Check employee eligibility |
| GET | `/statutory-leave/:id` | Yes | Get statutory leave by ID |
| PATCH | `/statutory-leave/:id` | Yes | Update statutory leave |
| POST | `/statutory-leave/:id/start` | Yes | Start leave period |
| POST | `/statutory-leave/:id/complete` | Yes | Complete leave period |
| POST | `/statutory-leave/:id/cancel` | Yes | Cancel leave |
| POST | `/statutory-leave/:id/curtail` | Yes | Curtail leave for ShPL |
| GET | `/statutory-leave/:id/pay` | Yes | Get pay calculation |
| POST | `/statutory-leave/:id/pay/recalculate` | Yes | Recalculate statutory pay |
| GET | `/statutory-leave/:id/kit-days` | Yes | List KIT/SPLIT days |
| POST | `/statutory-leave/:id/kit-days` | Yes | Record KIT/SPLIT day |

---

### Pension (`/api/v1/pension`)

UK workplace pension auto-enrolment under the Pensions Act 2008.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/pension/schemes` | Yes | Create pension scheme |
| GET | `/pension/schemes` | Yes | List pension schemes |
| POST | `/pension/assess/:employeeId` | Yes | Assess employee eligibility |
| POST | `/pension/enrol/:employeeId` | Yes | Auto-enrol eligible employee |
| PATCH | `/pension/enrolments/:id/opt-out` | Yes | Process opt-out |
| POST | `/pension/enrolments/:id/postpone` | Yes | Postpone assessment |
| POST | `/pension/contributions/calculate` | Yes | Calculate contributions |
| POST | `/pension/re-enrolment` | Yes | Trigger bulk re-enrolment |
| GET | `/pension/enrolments` | Yes | List pension enrolments |
| GET | `/pension/compliance` | Yes | Get compliance summary |

---

### Probation (`/api/v1/probation`)

Probation review management and reminder tracking.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/probation/reviews` | Yes | List all probation reviews |
| GET | `/probation/reviews/upcoming` | Yes | Reviews due in next 30 days |
| GET | `/probation/reviews/overdue` | Yes | Reviews past due date |
| GET | `/probation/reviews/:id` | Yes | Get review with reminders |
| POST | `/probation/reviews` | Yes | Create probation review |
| PATCH | `/probation/reviews/:id/extend` | Yes | Extend probation period |
| PATCH | `/probation/reviews/:id/complete` | Yes | Record probation outcome |

---

### Warnings (`/api/v1/warnings`)

Employee warning management with appeal and rescission workflows.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/warnings/employee/:employeeId` | Yes | List warnings for employee |
| GET | `/warnings/:id` | Yes | Get warning by ID |
| GET | `/warnings/employee/:employeeId/active` | Yes | Get active warnings |
| POST | `/warnings/` | Yes | Issue a new warning |
| POST | `/warnings/:id/appeal` | Yes | Submit an appeal |
| PATCH | `/warnings/:id/appeal/resolve` | Yes | Resolve an appeal |
| PATCH | `/warnings/:id/rescind` | Yes | Rescind a warning |
| POST | `/warnings/batch-expire` | Yes | Batch expire active warnings |

---

### Bereavement (`/api/v1/bereavement`)

Parental Bereavement Leave (Jack's Law) management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/bereavement/` | Yes | List bereavement leave records |
| GET | `/bereavement/:id` | Yes | Get bereavement leave record |
| POST | `/bereavement/` | Yes | Create bereavement leave request |
| PUT | `/bereavement/:id` | Yes | Update bereavement leave record |
| PATCH | `/bereavement/:id/status` | Yes | Transition bereavement leave status |

---

### Carer's Leave (`/api/v1/carers-leave`)

Carer's leave entitlements under the Carer's Leave Act 2023.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/carers-leave/` | Yes | List carer's leave entitlements |
| GET | `/carers-leave/:id` | Yes | Get entitlement by ID |
| POST | `/carers-leave/` | Yes | Create carer's leave entitlement |
| PUT | `/carers-leave/:id` | Yes | Update entitlement |
| PATCH | `/carers-leave/:id/status` | Yes | Approve or reject carer's leave |
| DELETE | `/carers-leave/:id` | Yes | Delete entitlement |

---

### Family Leave (`/api/v1/family-leave`)

Unified family leave management: maternity, paternity, shared parental, and adoption leave.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/family-leave/dashboard` | Yes | Compliance dashboard |
| POST | `/family-leave/entitlements` | Yes | Create family leave entitlement |
| GET | `/family-leave/entitlements` | Yes | List entitlements |
| GET | `/family-leave/entitlements/:id` | Yes | Get entitlement detail |
| POST | `/family-leave/entitlements/:id/check-eligibility` | Yes | Check eligibility |
| POST | `/family-leave/entitlements/:id/calculate-pay` | Yes | Calculate statutory pay |
| POST | `/family-leave/entitlements/:id/kit-day` | Yes | Record KIT/SPLIT day |
| PATCH | `/family-leave/entitlements/:id/curtail` | Yes | Curtail for ShPL conversion |
| GET | `/family-leave/entitlements/:id/pay-schedule` | Yes | Get pay schedule |
| POST | `/family-leave/entitlements/:id/notices` | Yes | Record formal notice |

---

### Parental Leave (`/api/v1/parental-leave`)

Unpaid parental leave entitlements and bookings (UK Employment Rights Act 1996).

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/parental-leave/entitlements` | Yes | Register child for parental leave |
| GET | `/parental-leave/entitlements/:employeeId` | Yes | Get employee entitlements |
| POST | `/parental-leave/bookings` | Yes | Create parental leave booking |
| GET | `/parental-leave/bookings` | Yes | List bookings with filters |
| PATCH | `/parental-leave/bookings/:id/approve` | Yes | Approve booking |
| PATCH | `/parental-leave/bookings/:id/reject` | Yes | Reject booking |

---

### Flexible Working (`/api/v1/flexible-working`)

Flexible working requests under the Employment Relations (Flexible Working) Act 2023.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/flexible-working/requests` | Yes | Submit flexible working request |
| GET | `/flexible-working/requests` | Yes | List flexible working requests |
| GET | `/flexible-working/requests/:id` | Yes | Get request by ID |
| PATCH | `/flexible-working/requests/:id/consultation` | Yes | Schedule consultation |
| POST | `/flexible-working/requests/:id/consultations` | Yes | Record consultation meeting |
| GET | `/flexible-working/requests/:id/consultations` | Yes | List consultation records |
| GET | `/flexible-working/requests/:id/history` | Yes | Get request status history |
| PATCH | `/flexible-working/requests/:id/approve` | Yes | Approve request |
| PATCH | `/flexible-working/requests/:id/reject` | Yes | Reject request |
| PATCH | `/flexible-working/requests/:id/withdraw` | Yes | Withdraw request |
| POST | `/flexible-working/requests/:id/appeal` | Yes | Appeal rejection |
| PATCH | `/flexible-working/requests/:id/appeal/resolve` | Yes | Resolve appeal |
| PATCH | `/flexible-working/requests/:id/respond` | Yes | Combined approve/reject (deprecated) |
| GET | `/flexible-working/compliance-summary` | Yes | Get compliance summary |

---

### Return to Work (`/api/v1/return-to-work`)

Return-to-work interview management following absence periods.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/return-to-work/` | Yes | List interviews |
| GET | `/return-to-work/:id` | Yes | Get interview by ID |
| POST | `/return-to-work/` | Yes | Create interview |
| PUT | `/return-to-work/:id` | Yes | Update interview |
| PATCH | `/return-to-work/:id/complete` | Yes | Complete interview with assessment |

---

### Working Time Regulations (`/api/v1/wtr`)

UK Working Time Regulations 1998 monitoring, opt-outs, and alerts.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/wtr/compliance` | Yes | Compliance dashboard report |
| GET | `/wtr/alerts` | Yes | List WTR alerts |
| POST | `/wtr/alerts/:id/acknowledge` | Yes | Acknowledge alert |
| GET | `/wtr/opt-outs` | Yes | List opt-out agreements |
| POST | `/wtr/opt-outs` | Yes | Create opt-out agreement |
| POST | `/wtr/opt-outs/:id/revoke` | Yes | Revoke opt-out agreement |
| GET | `/wtr/employees/:employeeId/status` | Yes | Get individual working time status |

---

### Reasonable Adjustments (`/api/v1/reasonable-adjustments`)

Reasonable adjustment tracking per Equality Act 2010 (ss.20-22).

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/reasonable-adjustments/` | Yes | Create adjustment request |
| GET | `/reasonable-adjustments/` | Yes | List adjustments |
| GET | `/reasonable-adjustments/due-reviews` | Yes | Get adjustments due for review |
| GET | `/reasonable-adjustments/:id` | Yes | Get adjustment by ID |
| PATCH | `/reasonable-adjustments/:id/assess` | Yes | Record assessment |
| PATCH | `/reasonable-adjustments/:id/decide` | Yes | Record decision |
| PATCH | `/reasonable-adjustments/:id/implement` | Yes | Mark as implemented |
| PATCH | `/reasonable-adjustments/:id/withdraw` | Yes | Withdraw request |

---

### Contract Amendments (`/api/v1/contract-amendments`)

Contract amendment management per Employment Rights Act 1996, s.4.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/contract-amendments/` | Yes | List contract amendments |
| GET | `/contract-amendments/:id` | Yes | Get amendment by ID |
| POST | `/contract-amendments/` | Yes | Create contract amendment |
| PUT | `/contract-amendments/:id` | Yes | Update contract amendment |
| PATCH | `/contract-amendments/:id/status` | Yes | Transition amendment status |

---

### Contract Statements (`/api/v1/contract-statements`)

UK Written Statements of Employment Particulars (Employment Rights Act 1996, s.1-7B).

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/contract-statements/generate/:employeeId` | Yes | Generate written statement |
| GET | `/contract-statements/compliance` | Yes | Compliance status report |
| GET | `/contract-statements/` | Yes | List all statements |
| GET | `/contract-statements/:id` | Yes | Get statement by ID |
| PATCH | `/contract-statements/:id/issue` | Yes | Issue statement to employee |
| PATCH | `/contract-statements/:id/acknowledge` | Yes | Acknowledge receipt |

---

## GDPR & Data Protection

---

### Consent (`/api/v1/consent`)

GDPR consent purpose and record management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/consent/purposes` | Yes | List consent purposes |
| GET | `/consent/purposes/:id` | Yes | Get consent purpose |
| POST | `/consent/purposes` | Yes | Create consent purpose |
| PATCH | `/consent/purposes/:id` | Yes | Update consent purpose |
| GET | `/consent/records` | Yes | List consent records |
| POST | `/consent/records/grant` | Yes | Grant consent |
| POST | `/consent/records/withdraw` | Yes | Withdraw consent |
| GET | `/consent/employees/:employeeId/consents` | Yes | Get employee consents |
| GET | `/consent/employees/:employeeId/check/:purposeCode` | Yes | Check employee consent |
| GET | `/consent/dashboard` | Yes | Consent dashboard statistics |
| GET | `/consent/stale` | Yes | Find consents requiring re-consent |

---

### Data Breach (`/api/v1/data-breach`)

UK GDPR data breach notification workflow (Articles 33-34).

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/data-breach/incidents` | Yes | Report a new data breach |
| GET | `/data-breach/incidents` | Yes | List data breaches |
| GET | `/data-breach/dashboard` | Yes | Get breach dashboard |
| GET | `/data-breach/incidents/:id` | Yes | Get data breach by ID |
| PATCH | `/data-breach/incidents/:id/assess` | Yes | Assess breach risk |
| POST | `/data-breach/incidents/:id/notify-ico` | Yes | Record ICO notification |
| POST | `/data-breach/incidents/:id/notify-subjects` | Yes | Record subject notifications |
| POST | `/data-breach/incidents/:id/timeline` | Yes | Add timeline entry |
| GET | `/data-breach/incidents/:id/timeline` | Yes | Get breach timeline |
| PATCH | `/data-breach/incidents/:id/close` | Yes | Close breach |

---

### Data Erasure (`/api/v1/data-erasure`)

GDPR Article 17 (Right to Erasure) request management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/data-erasure/requests` | Yes | List erasure requests |
| GET | `/data-erasure/requests/overdue` | Yes | Get overdue requests |
| POST | `/data-erasure/requests` | Yes | Create erasure request |
| GET | `/data-erasure/requests/:id` | Yes | Get erasure request detail |
| POST | `/data-erasure/requests/:id/approve` | Yes | Approve erasure request |
| POST | `/data-erasure/requests/:id/execute` | Yes | Execute anonymization |
| POST | `/data-erasure/requests/:id/complete` | Yes | Complete with certificate |
| POST | `/data-erasure/requests/:id/reject` | Yes | Reject erasure request |
| GET | `/data-erasure/requests/:id/audit-log` | Yes | Get erasure audit log |
| GET | `/data-erasure/employees/:employeeId/retention-conflicts` | Yes | Check retention conflicts |
| GET | `/data-erasure/requests/:id/certificate` | Yes | Generate erasure certificate |

---

### Data Retention (`/api/v1/data-retention`)

UK GDPR Article 5(1)(e) storage limitation policies and review execution.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/data-retention/policies` | Yes | Create retention policy |
| GET | `/data-retention/policies` | Yes | List retention policies |
| GET | `/data-retention/policies/:id` | Yes | Get retention policy |
| PATCH | `/data-retention/policies/:id` | Yes | Update retention policy |
| POST | `/data-retention/policies/seed-defaults` | Yes | Seed UK default policies |
| POST | `/data-retention/reviews/:policyId` | Yes | Execute retention review |
| GET | `/data-retention/reviews` | Yes | List retention reviews |
| POST | `/data-retention/exceptions` | Yes | Create retention exception (legal hold) |
| DELETE | `/data-retention/exceptions/:id` | Yes | Remove retention exception |
| GET | `/data-retention/dashboard` | Yes | Retention dashboard |
| GET | `/data-retention/policies/:id/expired-records` | Yes | Identify expired records |

---

### DSAR (`/api/v1/dsar`)

Data Subject Access Request management (UK GDPR Articles 15-20).

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/dsar/requests/dashboard` | Yes | Get DSAR dashboard statistics |
| GET | `/dsar/requests/overdue` | Yes | List overdue DSARs |
| GET | `/dsar/requests` | Yes | List DSAR requests |
| POST | `/dsar/requests` | Yes | Create a new DSAR request |
| GET | `/dsar/requests/:id` | Yes | Get DSAR request detail |
| POST | `/dsar/requests/:id/verify-identity` | Yes | Verify data subject identity |
| POST | `/dsar/requests/:id/gather/:moduleName` | Yes | Gather data from a module |
| PATCH | `/dsar/requests/:id/data-items/:itemId` | Yes | Update a data item (redact/exclude) |
| POST | `/dsar/requests/:id/extend` | Yes | Extend DSAR deadline |
| POST | `/dsar/requests/:id/complete` | Yes | Complete DSAR request |
| POST | `/dsar/requests/:id/reject` | Yes | Reject DSAR request |
| GET | `/dsar/requests/:id/audit-log` | Yes | Get DSAR audit trail |

---

### Privacy Notices (`/api/v1/privacy-notices`)

UK GDPR privacy notice management and employee acknowledgement tracking.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/privacy-notices/` | Yes | List privacy notices |
| GET | `/privacy-notices/outstanding` | Yes | List outstanding acknowledgements |
| GET | `/privacy-notices/compliance-summary` | Yes | Get compliance summary |
| GET | `/privacy-notices/:id` | Yes | Get privacy notice by ID |
| POST | `/privacy-notices/` | Yes | Create privacy notice |
| PATCH | `/privacy-notices/:id` | Yes | Update privacy notice |
| POST | `/privacy-notices/:id/acknowledge` | Yes | Acknowledge privacy notice |

---

## Payroll & Compensation

---

### Payroll (`/api/v1/payroll`)

Payroll run lifecycle, calculation, export, tax details, and payslip retrieval.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/payroll/runs` | Yes | Create payroll run |
| GET | `/payroll/runs` | Yes | List payroll runs |
| GET | `/payroll/runs/:id` | Yes | Get payroll run detail with lines |
| POST | `/payroll/runs/:id/calculate` | Yes | Calculate payroll |
| PATCH | `/payroll/runs/:id/approve` | Yes | Approve payroll run |
| POST | `/payroll/runs/:id/export` | Yes | Export payroll data (CSV/JSON) |
| PUT | `/payroll/employees/:id/tax-details` | Yes | Update employee tax details |
| GET | `/payroll/employees/:id/tax-details` | Yes | Get employee tax details |
| GET | `/payroll/employees/:id/payslips/:runId` | Yes | Get employee payslip |
| GET | `/payroll/pay-schedules` | Yes | List pay schedules |
| POST | `/payroll/pay-schedules` | Yes | Create pay schedule |
| GET | `/payroll/pay-schedules/:id` | Yes | Get pay schedule by ID |
| PUT | `/payroll/pay-schedules/:id` | Yes | Update pay schedule |
| POST | `/payroll/employees/:id/pay-assignment` | Yes | Assign employee to pay schedule |
| GET | `/payroll/employees/:id/pay-assignments` | Yes | Get employee pay assignments |
| GET | `/payroll/employees/:id/pay-assignment/current` | Yes | Get current pay assignment |

---

### Payroll Config (`/api/v1/payroll-config`)

Payroll configuration: pay schedules, employee pay assignments, and NI categories.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/payroll-config/pay-schedules` | Yes | List pay schedules |
| GET | `/payroll-config/pay-schedules/:id` | Yes | Get pay schedule by ID |
| POST | `/payroll-config/pay-schedules` | Yes | Create pay schedule |
| PUT | `/payroll-config/pay-schedules/:id` | Yes | Update pay schedule |
| GET | `/payroll-config/employees/:employeeId/pay-assignments` | Yes | List employee pay assignments |
| POST | `/payroll-config/pay-assignments` | Yes | Create employee pay assignment |
| GET | `/payroll-config/employees/:employeeId/ni-categories` | Yes | List employee NI categories |
| POST | `/payroll-config/ni-categories` | Yes | Create NI category record |

---

### Payslips (`/api/v1/payslips`)

Payslip template and payslip management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/payslips/templates` | Yes | List payslip templates |
| GET | `/payslips/templates/:id` | Yes | Get payslip template |
| POST | `/payslips/templates` | Yes | Create payslip template |
| PUT | `/payslips/templates/:id` | Yes | Update payslip template |
| GET | `/payslips/employee/:employeeId` | Yes | List payslips for employee |
| GET | `/payslips/:id` | Yes | Get payslip by ID |
| POST | `/payslips/` | Yes | Create/generate payslip |
| PATCH | `/payslips/:id/status` | Yes | Update payslip status |

---

### Deductions (`/api/v1/deductions`)

Deduction type catalogue and employee deduction assignments.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/deductions/types` | Yes | List deduction types |
| GET | `/deductions/types/:id` | Yes | Get deduction type by ID |
| POST | `/deductions/types` | Yes | Create deduction type |
| PUT | `/deductions/types/:id` | Yes | Update deduction type |
| GET | `/deductions/employee/:employeeId` | Yes | List employee deductions |
| GET | `/deductions/:id` | Yes | Get employee deduction |
| POST | `/deductions/` | Yes | Create employee deduction |
| PUT | `/deductions/:id` | Yes | Update employee deduction |

---

### Tax Codes (`/api/v1/tax-codes`)

Employee HMRC tax code management with effective dating.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/tax-codes/employee/:employeeId` | Yes | List tax codes for employee |
| GET | `/tax-codes/:id` | Yes | Get tax code by ID |
| POST | `/tax-codes/` | Yes | Create tax code |
| PUT | `/tax-codes/:id` | Yes | Update tax code |

---

### NMW (`/api/v1/nmw`)

National Minimum Wage / National Living Wage compliance management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/nmw/rates` | Yes | List NMW/NLW rates |
| POST | `/nmw/rates` | Yes | Create tenant-specific rate |
| POST | `/nmw/check/:employeeId` | Yes | Check employee NMW compliance |
| POST | `/nmw/check-all` | Yes | Bulk check all active employees |
| GET | `/nmw/compliance-report` | Yes | Get compliance report |

---

## HR Operations

---

### Agencies (`/api/v1/agencies`)

Recruitment agency and placement management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/agencies/` | Yes | List recruitment agencies |
| GET | `/agencies/:id` | Yes | Get agency by ID |
| POST | `/agencies/` | Yes | Create recruitment agency |
| PATCH | `/agencies/:id` | Yes | Update agency |
| DELETE | `/agencies/:id` | Yes | Delete agency |
| GET | `/agencies/:id/placements` | Yes | List agency placements |
| POST | `/agencies/:id/placements` | Yes | Create agency placement |
| PATCH | `/agencies/:id/placements/:placementId` | Yes | Update placement |

---

### Assessments (`/api/v1/assessments`)

Assessment templates and candidate assessment scheduling.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/assessments/templates` | Yes | List assessment templates |
| GET | `/assessments/templates/:id` | Yes | Get assessment template |
| POST | `/assessments/templates` | Yes | Create assessment template |
| PATCH | `/assessments/templates/:id` | Yes | Update assessment template |
| GET | `/assessments/candidate-assessments` | Yes | List candidate assessments |
| GET | `/assessments/candidate-assessments/:id` | Yes | Get candidate assessment |
| POST | `/assessments/candidate-assessments` | Yes | Schedule candidate assessment |
| POST | `/assessments/candidate-assessments/:id/record-result` | Yes | Record assessment result |
| POST | `/assessments/candidate-assessments/:id/cancel` | Yes | Cancel candidate assessment |

---

### Bank Details (`/api/v1`)

Employee bank detail management (sensitive data, restricted access).

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/employees/:employeeId/bank-details` | Yes | List bank details for employee |
| GET | `/employees/:employeeId/bank-details/:id` | Yes | Get bank detail by ID |
| POST | `/employees/:employeeId/bank-details` | Yes | Create bank detail |
| PUT | `/employees/:employeeId/bank-details/:id` | Yes | Update bank detail |
| DELETE | `/employees/:employeeId/bank-details/:id` | Yes | Delete bank detail |

---

### Bank Holidays (`/api/v1/bank-holidays`)

Bank holiday configuration and bulk import.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/bank-holidays/` | Yes | List bank holidays |
| GET | `/bank-holidays/:id` | Yes | Get bank holiday by ID |
| POST | `/bank-holidays/` | Yes | Create bank holiday |
| PUT | `/bank-holidays/:id` | Yes | Update bank holiday |
| DELETE | `/bank-holidays/:id` | Yes | Delete bank holiday |
| POST | `/bank-holidays/import` | Yes | Bulk import bank holidays |

---

### DBS Checks (`/api/v1/dbs-checks`)

Disclosure and Barring Service check management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/dbs-checks/` | Yes | List DBS checks |
| GET | `/dbs-checks/:id` | Yes | Get DBS check by ID |
| POST | `/dbs-checks/` | Yes | Create DBS check |
| PATCH | `/dbs-checks/:id` | Yes | Update DBS check |
| POST | `/dbs-checks/:id/submit` | Yes | Submit DBS check |
| POST | `/dbs-checks/:id/record-result` | Yes | Record DBS result |

---

### Delegations (`/api/v1/delegations`)

Approval delegation management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/delegations/` | Yes | Create approval delegation |
| GET | `/delegations/` | Yes | List my delegations |
| GET | `/delegations/active` | Yes | Get active delegation |
| DELETE | `/delegations/:id` | Yes | Revoke delegation |
| GET | `/delegations/:id/log` | Yes | View delegation usage log |

---

### Diversity (`/api/v1/diversity`)

Voluntary diversity monitoring data under Equality Act 2010.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/diversity/me` | Yes | Get my diversity data |
| PUT | `/diversity/me` | Yes | Submit or update my diversity data |
| DELETE | `/diversity/me` | Yes | Withdraw my diversity data |
| GET | `/diversity/aggregate` | Yes | Get aggregate diversity statistics |
| GET | `/diversity/completion-rate` | Yes | Get diversity data completion rate |

---

### Emergency Contacts (`/api/v1`)

Employee emergency contact management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/employees/:employeeId/emergency-contacts` | Yes | List contacts for employee |
| POST | `/employees/:employeeId/emergency-contacts` | Yes | Create emergency contact |
| PATCH | `/emergency-contacts/:id` | Yes | Update emergency contact |
| DELETE | `/emergency-contacts/:id` | Yes | Delete emergency contact |

---

### Employee Photos (`/api/v1`)

Employee profile photo metadata management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/employees/:employeeId/photos` | Yes | Get employee photo metadata |
| POST | `/employees/:employeeId/photos` | Yes | Upload (create/replace) photo |
| PATCH | `/employees/:employeeId/photos` | Yes | Update photo metadata |
| DELETE | `/employees/:employeeId/photos` | Yes | Delete photo |

---

### Equipment (`/api/v1/equipment`)

Equipment catalog and request management for provisioning.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/equipment/catalog` | Yes | List catalog items |
| POST | `/equipment/catalog` | Yes | Create catalog item |
| GET | `/equipment/catalog/:id` | Yes | Get catalog item |
| PATCH | `/equipment/catalog/:id` | Yes | Update catalog item |
| DELETE | `/equipment/catalog/:id` | Yes | Deactivate catalog item |
| GET | `/equipment/requests` | Yes | List equipment requests |
| POST | `/equipment/requests` | Yes | Create equipment request |
| GET | `/equipment/requests/:id` | Yes | Get request with history |
| PATCH | `/equipment/requests/:id/status` | Yes | Update request status |

---

### Geofence (`/api/v1/geofences`)

Geofence location management, proximity checks, and violation resolution.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/geofences/locations` | Yes | List geofence locations |
| GET | `/geofences/locations/:id` | Yes | Get geofence location |
| POST | `/geofences/locations` | Yes | Create geofence location |
| PATCH | `/geofences/locations/:id` | Yes | Update geofence location |
| DELETE | `/geofences/locations/:id` | Yes | Deactivate geofence location |
| GET | `/geofences/nearby` | Yes | Find nearby geofences |
| POST | `/geofences/check-location` | Yes | Check if location is within zone |
| GET | `/geofences/violations` | Yes | List violations |
| GET | `/geofences/violations/:id` | Yes | Get violation |
| POST | `/geofences/violations/:id/resolve` | Yes | Resolve violation |

---

### Headcount Planning (`/api/v1/headcount-planning`)

Headcount plan and plan item management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/headcount-planning/plans` | Yes | List headcount plans |
| GET | `/headcount-planning/plans/:id` | Yes | Get headcount plan |
| POST | `/headcount-planning/plans` | Yes | Create headcount plan |
| PATCH | `/headcount-planning/plans/:id` | Yes | Update headcount plan |
| POST | `/headcount-planning/plans/:id/approve` | Yes | Approve headcount plan |
| DELETE | `/headcount-planning/plans/:id` | Yes | Delete headcount plan |
| GET | `/headcount-planning/plans/:id/items` | Yes | List plan items |
| POST | `/headcount-planning/plans/:id/items` | Yes | Add plan item |
| PATCH | `/headcount-planning/plans/:id/items/:itemId` | Yes | Update plan item |
| DELETE | `/headcount-planning/plans/:id/items/:itemId` | Yes | Delete plan item |

---

### Health & Safety (`/api/v1/health-safety`)

Workplace health and safety: incidents (accident book), RIDDOR reporting, risk assessments, and DSE assessments.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/health-safety/dashboard` | Yes | Get H&S dashboard statistics |
| GET | `/health-safety/riddor-reports` | Yes | List RIDDOR-reportable incidents |
| GET | `/health-safety/incidents` | Yes | List incidents |
| POST | `/health-safety/incidents` | Yes | Report a new incident |
| GET | `/health-safety/incidents/:id` | Yes | Get incident details |
| PATCH | `/health-safety/incidents/:id` | Yes | Update an incident |
| POST | `/health-safety/incidents/:id/close` | Yes | Close an incident |
| GET | `/health-safety/risk-assessments` | Yes | List risk assessments |
| POST | `/health-safety/risk-assessments` | Yes | Create risk assessment |
| GET | `/health-safety/risk-assessments/:id` | Yes | Get risk assessment details |
| PATCH | `/health-safety/risk-assessments/:id` | Yes | Update risk assessment |
| POST | `/health-safety/risk-assessments/:id/approve` | Yes | Approve risk assessment |
| GET | `/health-safety/dse-assessments` | Yes | List DSE assessments |
| POST | `/health-safety/dse-assessments` | Yes | Create DSE assessment |
| GET | `/health-safety/dse-assessments/:id` | Yes | Get DSE assessment details |
| GET | `/health-safety/dse-assessments/employee/:employeeId` | Yes | Get DSE assessments for employee |

---

### Jobs (`/api/v1/jobs`)

Jobs catalog for position definitions.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/jobs/` | Yes | List jobs with filters |
| GET | `/jobs/:id` | Yes | Get job by ID |
| POST | `/jobs/` | Yes | Create job |
| PUT | `/jobs/:id` | Yes | Update job |
| PATCH | `/jobs/:id/archive` | Yes | Archive job |

---

### Letter Templates (`/api/v1/letter-templates`)

Letter template management and letter generation with placeholder rendering.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/letter-templates/templates` | Yes | List letter templates |
| GET | `/letter-templates/templates/:id` | Yes | Get letter template |
| POST | `/letter-templates/templates` | Yes | Create letter template |
| PATCH | `/letter-templates/templates/:id` | Yes | Update letter template |
| POST | `/letter-templates/templates/:id/generate` | Yes | Generate letter from template |
| GET | `/letter-templates/generated` | Yes | List generated letters |
| GET | `/letter-templates/generated/:id` | Yes | Get generated letter |

---

### Reference Checks (`/api/v1/reference-checks`)

Employment reference check management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/reference-checks/` | Yes | List reference checks |
| GET | `/reference-checks/:id` | Yes | Get reference check by ID |
| POST | `/reference-checks/` | Yes | Create reference check |
| PATCH | `/reference-checks/:id` | Yes | Update reference check |
| POST | `/reference-checks/:id/send` | Yes | Send reference request |
| POST | `/reference-checks/:id/verify` | Yes | Verify reference check |

---

### Secondments (`/api/v1/secondments`)

Secondment management with status transitions.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/secondments/` | Yes | List secondments |
| GET | `/secondments/:id` | Yes | Get secondment by ID |
| POST | `/secondments/` | Yes | Create secondment |
| PATCH | `/secondments/:id` | Yes | Update secondment |
| POST | `/secondments/:id/transition` | Yes | Transition secondment status |

---

### Training Budgets (`/api/v1/training-budgets`)

Training budget management and expense tracking.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/training-budgets/budgets` | Yes | List training budgets |
| GET | `/training-budgets/budgets/:id` | Yes | Get training budget |
| POST | `/training-budgets/budgets` | Yes | Create training budget |
| PATCH | `/training-budgets/budgets/:id` | Yes | Update training budget |
| GET | `/training-budgets/expenses` | Yes | List training expenses |
| GET | `/training-budgets/expenses/:id` | Yes | Get training expense |
| POST | `/training-budgets/expenses` | Yes | Create training expense |
| PATCH | `/training-budgets/expenses/:id/status` | Yes | Update expense status |

---

### Gender Pay Gap (`/api/v1/gender-pay-gap`)

UK Gender Pay Gap reporting for organisations with 250+ employees.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/gender-pay-gap/reports` | Yes | Generate GPG report for year |
| POST | `/gender-pay-gap/calculate` | Yes | Calculate GPG with explicit snapshot date |
| GET | `/gender-pay-gap/reports` | Yes | List GPG reports |
| GET | `/gender-pay-gap/dashboard` | Yes | GPG dashboard with trends |
| GET | `/gender-pay-gap/reports/:id` | Yes | Get GPG report with all metrics |
| PATCH | `/gender-pay-gap/reports/:id/publish` | Yes | Publish GPG report |

---

## Learning & Notifications

---

### CPD (`/api/v1/cpd`)

Continuing Professional Development record management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/cpd/records` | Yes | List CPD records |
| GET | `/cpd/records/:id` | Yes | Get CPD record by ID |
| POST | `/cpd/records` | Yes | Create CPD record |
| PATCH | `/cpd/records/:id` | Yes | Update CPD record |
| POST | `/cpd/records/:id/verify` | Yes | Verify CPD record |
| DELETE | `/cpd/records/:id` | Yes | Delete CPD record |

---

### Course Ratings (`/api/v1/course-ratings`)

Course rating and review management for the LMS.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/course-ratings/course/:courseId` | Yes | List ratings for a course |
| GET | `/course-ratings/summary/:courseId` | Yes | Get rating summary for a course |
| POST | `/course-ratings/` | Yes | Submit a course rating |

---

### Notifications (`/api/v1/notifications`)

User-scoped notification management and push token registration.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/notifications/` | Yes | List user's notifications |
| GET | `/notifications/unread-count` | Yes | Get unread notification count |
| GET | `/notifications/push-tokens` | Yes | List push tokens |
| POST | `/notifications/push-tokens` | Yes | Register push token |
| DELETE | `/notifications/push-tokens/:id` | Yes | Remove push token |
| POST | `/notifications/read-all` | Yes | Mark all as read |
| GET | `/notifications/:id` | Yes | Get notification by ID |
| POST | `/notifications/:id/read` | Yes | Mark notification as read |
| POST | `/notifications/:id/dismiss` | Yes | Dismiss notification |
| DELETE | `/notifications/:id` | Yes | Delete notification |

---

### Reports (`/api/v1/reports`)

Reporting engine: CRUD, execution, export, field catalog, favourites, and scheduling.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/reports/fields` | Yes | Get field catalog |
| GET | `/reports/fields/categories` | Yes | Get field categories |
| GET | `/reports/fields/:fieldKey/values` | Yes | Get distinct values for field |
| GET | `/reports/templates` | Yes | List system report templates |
| POST | `/reports/templates/:id/create` | Yes | Create report from template |
| GET | `/reports/favourites` | Yes | List favourite reports |
| GET | `/reports/scheduled` | Yes | List scheduled reports |
| GET | `/reports/` | Yes | List reports |
| POST | `/reports/` | Yes | Create report |
| GET | `/reports/:id` | Yes | Get report by ID |
| PUT | `/reports/:id` | Yes | Update report |
| DELETE | `/reports/:id` | Yes | Delete report |
| POST | `/reports/:id/duplicate` | Yes | Duplicate report |
| POST | `/reports/:id/publish` | Yes | Publish report |
| POST | `/reports/:id/archive` | Yes | Archive report |
| POST | `/reports/:id/execute` | Yes | Execute report |
| POST | `/reports/:id/execute/preview` | Yes | Preview report execution |
| GET | `/reports/:id/executions` | Yes | List past executions |
| POST | `/reports/:id/export/:format` | Yes | Export report |
| POST | `/reports/:id/favourite` | Yes | Add to favourites |
| DELETE | `/reports/:id/favourite` | Yes | Remove from favourites |
| POST | `/reports/:id/share` | Yes | Share report |
| POST | `/reports/:id/schedule` | Yes | Schedule report |
| DELETE | `/reports/:id/schedule` | Yes | Remove schedule |

---

## Portal

---

### Client Portal (`/api/v1/client-portal`)

Customer-facing portal API. Authentication via BetterAuth; portal users are linked by BetterAuth user ID.

#### Auth

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/auth/me` | Yes | Get current portal user profile |

#### Dashboard

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/dashboard` | Portal | Get dashboard data |

#### Tickets

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/tickets` | Portal | List my tickets |
| POST | `/client-portal/tickets` | Portal | Create ticket |
| GET | `/client-portal/tickets/:id` | Portal | Get ticket by ID |
| POST | `/client-portal/tickets/:id/messages` | Portal | Reply to ticket |

#### Documents

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/documents` | Portal | List documents |
| GET | `/client-portal/documents/:id` | Portal | Get document by ID |
| POST | `/client-portal/documents/:id/acknowledge` | Portal | Acknowledge document |

#### News

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/news` | Portal | List news articles |
| GET | `/client-portal/news/:slug` | Portal | Get news article by slug |

#### Billing

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/billing` | Portal | Get billing overview |
| GET | `/client-portal/billing/invoices` | Portal | List invoices |
| GET | `/client-portal/billing/invoices/:id` | Portal | Get invoice by ID |

#### Admin (requires portal admin role)

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/admin/tickets` | Admin | List all tickets |
| PATCH | `/client-portal/admin/tickets/:id` | Admin | Update ticket |
| GET | `/client-portal/admin/users` | Admin | List portal users |
| POST | `/client-portal/admin/users` | Admin | Create portal user |
| GET | `/client-portal/admin/users/:id` | Admin | Get portal user |
| PATCH | `/client-portal/admin/users/:id` | Admin | Update portal user |
| POST | `/client-portal/admin/documents` | Admin | Create document |
| PATCH | `/client-portal/admin/documents/:id` | Admin | Update document |
| DELETE | `/client-portal/admin/documents/:id` | Admin | Delete document |
| POST | `/client-portal/admin/news` | Admin | Create news article |
| PATCH | `/client-portal/admin/news/:id` | Admin | Update news article |
| DELETE | `/client-portal/admin/news/:id` | Admin | Delete news article |

---

## Talent & Performance Extensions

### Talent Pools (`/api/v1/talent-pools`)

Talent pool management for succession planning and internal mobility.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/talent-pools` | Yes | List talent pools |
| POST | `/talent-pools` | Yes | Create talent pool |
| GET | `/talent-pools/:id` | Yes | Get talent pool by ID |
| PATCH | `/talent-pools/:id` | Yes | Update talent pool |
| DELETE | `/talent-pools/:id` | Yes | Delete talent pool |
| GET | `/talent-pools/:id/members` | Yes | List pool members |
| POST | `/talent-pools/:id/members` | Yes | Add member to pool |
| PATCH | `/talent-pools/:id/members/:memberId` | Yes | Update pool member |
| DELETE | `/talent-pools/:id/members/:memberId` | Yes | Remove member from pool |

---

### 360 Feedback (`/api/v1/feedback-360`)

360-degree feedback cycles, reviewer nomination, and anonymised results.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/feedback-360/cycles` | Yes | List 360 feedback cycles |
| GET | `/feedback-360/cycles/:id` | Yes | Get cycle by ID |
| POST | `/feedback-360/cycles` | Yes | Create 360 feedback cycle |
| PATCH | `/feedback-360/cycles/:id` | Yes | Update cycle (status, deadline) |
| POST | `/feedback-360/cycles/:id/nominate` | Yes | Nominate reviewers for a cycle |
| GET | `/feedback-360/cycles/:id/responses` | Yes | List responses for a cycle |
| GET | `/feedback-360/cycles/:id/results` | Yes | Get aggregated results (anonymised) |
| POST | `/feedback-360/responses/:id/submit` | Yes | Submit feedback |
| POST | `/feedback-360/responses/:id/decline` | Yes | Decline feedback |

---

## Time & Scheduling Extensions

### Shift Swaps (`/api/v1/shift-swaps`)

Two-phase shift swap workflow: target employee accepts, then manager approves.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/shift-swaps` | Yes | Request a shift swap |
| GET | `/shift-swaps` | Yes | List shift swap requests |
| GET | `/shift-swaps/:id` | Yes | Get shift swap request by ID |
| POST | `/shift-swaps/:id/accept` | Yes | Target employee accepts swap |
| POST | `/shift-swaps/:id/reject` | Yes | Target employee rejects swap |
| POST | `/shift-swaps/:id/approve` | Yes | Manager approves swap |
| POST | `/shift-swaps/:id/manager-reject` | Yes | Manager rejects swap |
| POST | `/shift-swaps/:id/cancel` | Yes | Requester cancels swap |

---

## UK Compliance Extensions

### Overtime Requests (`/api/v1/overtime-requests`)

Overtime authorisation workflow with manager approval/rejection.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/overtime-requests` | Yes | Submit overtime request |
| GET | `/overtime-requests/my` | Yes | List my overtime requests |
| GET | `/overtime-requests/pending` | Yes | List pending requests (manager) |
| GET | `/overtime-requests/:id` | Yes | Get overtime request by ID |
| PATCH | `/overtime-requests/:id/approve` | Yes | Approve overtime request |
| PATCH | `/overtime-requests/:id/reject` | Yes | Reject overtime request |
| PATCH | `/overtime-requests/:id/cancel` | Yes | Cancel overtime request |

---

### Overtime Rules (`/api/v1/overtime-rules`)

Overtime rule configuration, rate multipliers, and calculation engine.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/overtime-rules` | Yes | Create an overtime rule |
| GET | `/overtime-rules` | Yes | List overtime rules |
| GET | `/overtime-rules/:id` | Yes | Get overtime rule by ID |
| PUT | `/overtime-rules/:id` | Yes | Update an overtime rule |
| DELETE | `/overtime-rules/:id` | Yes | Delete an overtime rule |
| POST | `/overtime-rules/calculate/:employeeId` | Yes | Calculate overtime for one employee |
| POST | `/overtime-rules/calculate/batch` | Yes | Batch calculate overtime for all employees |
| GET | `/overtime-rules/calculations` | Yes | List overtime calculations |
| GET | `/overtime-rules/calculations/:id` | Yes | Get overtime calculation by ID |
| POST | `/overtime-rules/calculations/:id/approve` | Yes | Approve an overtime calculation |

---

### Tribunal (`/api/v1/tribunal`)

Employment tribunal case preparation and document bundle management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/tribunal` | Yes | List tribunal cases |
| GET | `/tribunal/:id` | Yes | Get tribunal case by ID |
| POST | `/tribunal` | Yes | Create a new tribunal case |
| PATCH | `/tribunal/:id` | Yes | Update a tribunal case |
| DELETE | `/tribunal/:id` | Yes | Delete a tribunal case (preparation only) |
| POST | `/tribunal/:id/documents` | Yes | Add document to bundle |
| PATCH | `/tribunal/:id/documents/:documentId` | Yes | Update document in bundle |
| DELETE | `/tribunal/:id/documents/:documentId` | Yes | Remove document from bundle |

---

## GDPR Extensions

### Data Archival (`/api/v1/data-archival`)

Record archiving, restoration, policy-based archival, and compliance dashboard.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/data-archival/records` | Yes | List archived records |
| GET | `/data-archival/records/:id` | Yes | Get archived record by ID |
| POST | `/data-archival/records` | Yes | Manually archive a record |
| POST | `/data-archival/records/:id/restore` | Yes | Restore record from archive |
| POST | `/data-archival/run` | Yes | Run automated archival |
| GET | `/data-archival/dashboard` | Yes | Archival dashboard overview |
| GET | `/data-archival/rules` | Yes | List archival rules |
| POST | `/data-archival/rules/seed-defaults` | Yes | Seed UK default archival rules |
| POST | `/data-archival/policies` | Yes | Create archive policy |
| GET | `/data-archival/policies` | Yes | List archive policies |
| GET | `/data-archival/policies/:id` | Yes | Get archive policy by ID |
| PATCH | `/data-archival/policies/:id` | Yes | Update archive policy |
| DELETE | `/data-archival/policies/:id` | Yes | Delete archive policy |
| GET | `/data-archival/log` | Yes | List archive execution log |
| POST | `/data-archival/archival/run` | Yes | Run policy-based archival |
| POST | `/data-archival/archival/:id/restore` | Yes | Restore from policy-based archive |

---

### DPIA (`/api/v1/dpia`)

UK GDPR Article 35 Data Protection Impact Assessments with DPO review workflow.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/dpia` | Yes | Create a new DPIA assessment |
| GET | `/dpia` | Yes | List DPIA assessments |
| GET | `/dpia/:id` | Yes | Get DPIA by ID (includes risks) |
| PATCH | `/dpia/:id` | Yes | Update DPIA (draft only) |
| POST | `/dpia/:id/risks` | Yes | Add a risk to a DPIA |
| GET | `/dpia/:id/risks` | Yes | List risks for a DPIA |
| POST | `/dpia/:id/submit` | Yes | Submit for DPO review |
| POST | `/dpia/:id/approve` | Yes | DPO approves or rejects |

---

## Payroll Extensions

### Salary Sacrifice (`/api/v1/salary-sacrifices`)

Salary sacrifice arrangement management with NMW compliance validation.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/salary-sacrifices` | Yes | List salary sacrifices |
| GET | `/salary-sacrifices/employee/:employeeId` | Yes | List sacrifices for an employee |
| GET | `/salary-sacrifices/:id` | Yes | Get salary sacrifice by ID |
| POST | `/salary-sacrifices` | Yes | Create salary sacrifice |
| PUT | `/salary-sacrifices/:id` | Yes | Update salary sacrifice |
| DELETE | `/salary-sacrifices/:id` | Yes | End salary sacrifice (soft delete) |

---

## Employee Data Extensions

### Global Mobility (`/api/v1/global-mobility/assignments`)

International assignment tracking with status transitions.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/global-mobility/assignments` | Yes | List international assignments |
| GET | `/global-mobility/assignments/expiring` | Yes | List expiring assignments |
| GET | `/global-mobility/assignments/:id` | Yes | Get assignment by ID |
| POST | `/global-mobility/assignments` | Yes | Create assignment |
| PATCH | `/global-mobility/assignments/:id` | Yes | Update assignment |
| POST | `/global-mobility/assignments/:id/transition` | Yes | Transition assignment status |

---

### Employee Change Requests

Employee self-service change requests with HR/manager approval workflow. Two route groups.

#### Portal Routes (`/api/v1/portal/change-requests`)

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/portal/change-requests` | Yes | Submit a change request |
| POST | `/portal/change-requests/bulk` | Yes | Submit multiple change requests |
| GET | `/portal/change-requests` | Yes | List my change requests |
| GET | `/portal/change-requests/pending-count` | Yes | Count my pending requests |
| DELETE | `/portal/change-requests/:id` | Yes | Cancel a pending change request |

#### Admin Routes (`/api/v1/hr/change-requests`)

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/hr/change-requests` | Yes | List pending requests for review |
| GET | `/hr/change-requests/count` | Yes | Count pending requests for review |
| GET | `/hr/change-requests/:id` | Yes | Get a change request by ID |
| PATCH | `/hr/change-requests/:id/review` | Yes | Approve or reject a change request |

---

### Personal Detail Changes

Personal detail self-service changes with sensitive-field approval workflow. Two route groups.

#### Portal Routes (`/api/v1/portal/personal-detail-changes`)

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/portal/personal-detail-changes` | Yes | Submit a personal detail change |
| GET | `/portal/personal-detail-changes` | Yes | List my change requests |
| GET | `/portal/personal-detail-changes/pending-count` | Yes | Count my pending requests |
| PATCH | `/portal/personal-detail-changes/:id/cancel` | Yes | Cancel a pending request |

#### Admin Routes (`/api/v1/hr/personal-detail-changes`)

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/hr/personal-detail-changes` | Yes | List pending requests for review |
| GET | `/hr/personal-detail-changes/count` | Yes | Count pending requests for review |
| GET | `/hr/personal-detail-changes/:id` | Yes | Get a change request by ID |
| PATCH | `/hr/personal-detail-changes/:id/review` | Yes | Approve or reject a change request |

---

### Beneficiary Nominations (`/api/v1`)

Beneficiary nomination management for employee benefit plans. Routes span both employee-scoped and direct paths.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/employees/:employeeId/beneficiary-nominations` | Yes | List nominations for employee |
| GET | `/employees/:employeeId/beneficiary-nominations/summary` | Yes | Percentage summary per benefit type |
| POST | `/employees/:employeeId/beneficiary-nominations` | Yes | Create a nomination |
| GET | `/beneficiary-nominations/:id` | Yes | Get a single nomination |
| PATCH | `/beneficiary-nominations/:id` | Yes | Update a nomination |
| DELETE | `/beneficiary-nominations/:id` | Yes | Delete a nomination |

---

### Cost Centre Assignments (`/api/v1/cost-centre-assignments`)

Effective-dated cost centre assignments for employees, departments, and positions.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/cost-centre-assignments` | Yes | List assignments (filterable) |
| GET | `/cost-centre-assignments/history/:entityType/:entityId` | Yes | Get entity assignment history |
| GET | `/cost-centre-assignments/:id` | Yes | Get assignment by ID |
| POST | `/cost-centre-assignments` | Yes | Create assignment |
| PATCH | `/cost-centre-assignments/:id` | Yes | Update assignment |

---

## Benefits Extensions

### Benefits Exchange (`/api/v1/benefits-exchange`)

Benefits provider data exchange for outbound and inbound file processing.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/benefits-exchange/generate` | Yes | Generate outbound exchange file |
| GET | `/benefits-exchange/history` | Yes | Get exchange history |
| GET | `/benefits-exchange/:id` | Yes | Get single exchange by ID |
| POST | `/benefits-exchange/inbound` | Yes | Process inbound exchange file |

---

### Income Protection (`/api/v1/income-protection`)

Income protection insurance policy and enrollment management.

#### Policies

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/income-protection/policies` | Yes | List income protection policies |
| GET | `/income-protection/policies/:id` | Yes | Get policy by ID |
| POST | `/income-protection/policies` | Yes | Create policy |
| PUT | `/income-protection/policies/:id` | Yes | Update policy |

#### Enrollments

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/income-protection/enrollments` | Yes | List enrollments |
| GET | `/income-protection/enrollments/:id` | Yes | Get enrollment by ID |
| POST | `/income-protection/enrollments` | Yes | Create enrollment |
| PUT | `/income-protection/enrollments/:id` | Yes | Update enrollment |

---

## Recruitment Extensions

### Job Boards (`/api/v1/job-boards`)

Job board integrations and vacancy publishing to UK job boards (Indeed, LinkedIn, Reed, Totaljobs, CWJobs).

#### Metadata

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/job-boards/boards` | Yes | List supported job boards |

#### Integrations

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/job-boards/integrations` | Yes | List configured integrations |
| POST | `/job-boards/integrations` | Yes | Add a new integration |
| GET | `/job-boards/integrations/:id` | Yes | Get integration by ID |
| PATCH | `/job-boards/integrations/:id` | Yes | Update an integration |
| DELETE | `/job-boards/integrations/:id` | Yes | Remove an integration |

#### Postings

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/job-boards/postings` | Yes | Publish vacancy to job board |
| GET | `/job-boards/postings` | Yes | List job board postings |
| GET | `/job-boards/postings/:id` | Yes | Get posting status |
| DELETE | `/job-boards/postings/:id` | Yes | Withdraw posting from job board |
| POST | `/job-boards/post/:jobId` | Yes | Post job to selected boards (multi-board) |

---

### Offer Letters (`/api/v1/recruitment/offers`)

Offer letter lifecycle: draft, send, accept, and decline.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/recruitment/offers` | Yes | Create offer letter |
| GET | `/recruitment/offers` | Yes | List offer letters |
| GET | `/recruitment/offers/:id` | Yes | Get offer letter by ID |
| PUT | `/recruitment/offers/:id` | Yes | Update draft offer letter |
| POST | `/recruitment/offers/:id/send` | Yes | Send offer letter to candidate |
| POST | `/recruitment/offers/:id/accept` | Yes | Candidate accepts offer |
| POST | `/recruitment/offers/:id/decline` | Yes | Candidate declines offer |

---

### Background Checks (`/api/v1/background-checks`)

Background check provider integration with webhook callbacks.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/background-checks` | Yes | Request a new background check |
| GET | `/background-checks` | Yes | List background check requests |
| GET | `/background-checks/:id` | Yes | Get background check by ID |
| POST | `/background-checks/webhooks/:provider` | No (HMAC) | Provider webhook callback |

---

## Platform & Infrastructure Extensions

### API Keys (`/api/v1/api-keys`)

API key management for machine-to-machine authentication.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api-keys` | Yes | List API keys (prefix only) |
| POST | `/api-keys` | Yes | Generate new API key (full key returned once) |
| GET | `/api-keys/:id` | Yes | Get API key details (prefix only) |
| PATCH | `/api-keys/:id` | Yes | Update name/scopes/expiry |
| DELETE | `/api-keys/:id` | Yes | Revoke API key |
| POST | `/api-keys/:id/rotate` | Yes | Rotate API key (atomic revoke + create) |

---

### Feature Flags

Admin CRUD and user-facing evaluation endpoints.

#### Admin Routes (`/api/v1/admin/feature-flags`)

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/admin/feature-flags` | Yes | List all flags for tenant |
| POST | `/admin/feature-flags` | Yes | Create a flag |
| PATCH | `/admin/feature-flags/:id` | Yes | Update a flag |
| DELETE | `/admin/feature-flags/:id` | Yes | Delete a flag |

#### Evaluation Routes (`/api/v1/feature-flags`)

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/feature-flags/evaluate` | Yes | Evaluate flags for current user (preferred) |
| GET | `/feature-flags/evaluate` | Yes | Evaluate flags for current user (deprecated) |

---

### Data Import (`/api/v1/data-import`)

Structured CSV data import with validation and execution pipeline.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/data-import/upload` | Yes | Upload CSV and create import job |
| POST | `/data-import/:id/validate` | Yes | Validate import job rows |
| POST | `/data-import/:id/execute` | Yes | Execute validated import |
| GET | `/data-import` | Yes | List import jobs |
| GET | `/data-import/:id` | Yes | Get import job status |
| GET | `/data-import/:id/errors` | Yes | Get per-row error details |

---

### Bulk Operations (`/api/v1/bulk`)

Batch processing for employees and leave requests.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/bulk/employees` | Yes | Bulk create employees |
| PATCH | `/bulk/employees` | Yes | Bulk update employee fields |
| POST | `/bulk/leave-requests` | Yes | Bulk approve/reject leave requests |
| POST | `/bulk` | Yes | Execute generic bulk API operations |

---

### Bulk Document Generation (`/api/v1/documents`)

Bulk document generation from letter templates for multiple employees.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/documents/bulk-generate` | Yes | Create bulk generation batch |
| GET | `/documents/bulk-generate/:batchId` | Yes | Get batch status with item details |

---

### E-Signatures (`/api/v1/e-signatures`)

E-signature request lifecycle with internal signing, external provider support, and audit trail.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/e-signatures` | Yes | List signature requests |
| POST | `/e-signatures` | Yes | Create signature request |
| GET | `/e-signatures/:id` | Yes | Get signature request by ID |
| GET | `/e-signatures/:id/events` | Yes | Get audit trail for signature request |
| POST | `/e-signatures/:id/send` | Yes | Mark request as sent |
| POST | `/e-signatures/:id/view` | Yes | Mark request as viewed |
| POST | `/e-signatures/:id/sign` | Yes | Internal sign ("I agree" with IP + timestamp) |
| POST | `/e-signatures/:id/decline` | Yes | Decline the signature request |
| POST | `/e-signatures/:id/cancel` | Yes | Cancel the signature request |
| POST | `/e-signatures/:id/void` | Yes | Void the signature request (admin) |
| POST | `/e-signatures/:id/remind` | Yes | Send a reminder to the signer |

---

### SSO

Enterprise SSO (SAML/OIDC) configuration and login endpoints.

#### Admin Routes (`/api/v1/sso/configs`)

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/sso/configs` | Yes | List SSO configurations |
| POST | `/sso/configs` | Yes | Create SSO configuration |
| GET | `/sso/configs/:id` | Yes | Get SSO configuration by ID |
| PATCH | `/sso/configs/:id` | Yes | Update SSO configuration |
| DELETE | `/sso/configs/:id` | Yes | Delete SSO configuration |
| GET | `/sso/configs/:id/login-attempts` | Yes | List login attempts (audit) |

#### Public Routes (`/api/v1/auth/sso`)

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/auth/sso/:tenantSlug/providers` | No | Discover SSO providers for a tenant |
| GET | `/auth/sso/:tenantSlug/:configId/login` | No | Initiate SSO login (redirect to IdP) |
| GET | `/auth/sso/:tenantSlug/:configId/callback` | No | OIDC callback (redirect from IdP) |

---

### Lookup Values (`/api/v1/lookup-values`)

Tenant-configurable lookup categories and values for dropdowns and settings.

#### Categories

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/lookup-values/categories` | Yes | List lookup categories |
| POST | `/lookup-values/categories` | Yes | Create lookup category |
| GET | `/lookup-values/categories/:id` | Yes | Get lookup category by ID |
| PATCH | `/lookup-values/categories/:id` | Yes | Update lookup category |
| DELETE | `/lookup-values/categories/:id` | Yes | Delete lookup category |
| GET | `/lookup-values/categories/:id/values` | Yes | List values in category |
| POST | `/lookup-values/categories/:id/values` | Yes | Create value in category |

#### Values

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/lookup-values/values/:id` | Yes | Get value by ID |
| PATCH | `/lookup-values/values/:id` | Yes | Update value |
| DELETE | `/lookup-values/values/:id` | Yes | Delete value |

#### Convenience

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/lookup-values/by-code/:code` | Yes | Get values by category code |
| POST | `/lookup-values/seed` | Yes | Seed default lookup categories |

---

### Integrations (`/api/v1/integrations`)

Third-party integration management with connection testing and configuration.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/integrations` | Yes | List all integrations for tenant |
| GET | `/integrations/:id` | Yes | Get a single integration |
| POST | `/integrations/connect` | Yes | Connect (create/update) an integration |
| PATCH | `/integrations/:id/config` | Yes | Update integration configuration |
| POST | `/integrations/:id/disconnect` | Yes | Disconnect an integration |
| POST | `/integrations/:id/test` | Yes | Test an integration connection |
| DELETE | `/integrations/:id` | Yes | Delete an integration |

---

### Policy Distribution (`/api/v1/policy-distributions`)

Policy document distribution and read-receipt tracking.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/policy-distributions` | Yes | List all policy distributions |
| POST | `/policy-distributions` | Yes | Distribute a policy document |
| GET | `/policy-distributions/:id/status` | Yes | Get distribution status with acknowledgements |
| POST | `/policy-distributions/acknowledge` | Yes | Acknowledge a distribution (read receipt) |

---

### Email Tracking (`/api/v1/email-tracking`)

Email delivery monitoring, statistics, and bounce event recording.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/email-tracking/deliveries` | Yes | List email delivery log entries |
| GET | `/email-tracking/deliveries/stats` | Yes | Get delivery statistics |
| GET | `/email-tracking/deliveries/:id` | Yes | Get single delivery log entry |
| POST | `/email-tracking/deliveries/bounce` | Yes | Record a bounce event (webhook) |

---

### Calendar Sync (`/api/v1/calendar`)

Calendar connection management and iCal feed serving.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/calendar/connections` | Yes | List user's calendar connections |
| POST | `/calendar/ical/enable` | Yes | Enable iCal feed (generates unique token) |
| POST | `/calendar/ical/regenerate` | Yes | Regenerate iCal feed token |
| DELETE | `/calendar/ical` | Yes | Disable iCal feed |
| GET | `/calendar/ical/:token` | No | Serve iCal feed (.ics) (token is credential) |

---

### Webhooks (`/api/v1/webhooks`)

Outbound webhook subscription management and delivery tracking.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/webhooks/subscriptions` | Yes | Create a webhook subscription |
| GET | `/webhooks/subscriptions` | Yes | List webhook subscriptions |
| GET | `/webhooks/subscriptions/:id` | Yes | Get a webhook subscription |
| PUT | `/webhooks/subscriptions/:id` | Yes | Update a webhook subscription |
| DELETE | `/webhooks/subscriptions/:id` | Yes | Delete a webhook subscription |
| POST | `/webhooks/subscriptions/:id/test` | Yes | Send a test webhook event |
| GET | `/webhooks/deliveries` | Yes | List webhook deliveries |

---

### Usage Stats (`/api/v1/system`)

Per-tenant usage analytics with daily and monthly granularity.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/system/usage` | Yes | Get tenant usage statistics |

---

## Related Documents

- [Error Codes](ERROR_CODES.md) — Error codes and messages for all API responses
- [Architecture Overview](../architecture/ARCHITECTURE.md) — System architecture and request flow
- [Security Patterns](../patterns/SECURITY.md) — Authentication, CSRF, and RLS enforcement
- [Permissions System](../architecture/PERMISSIONS_SYSTEM.md) — RBAC and endpoint authorization
- [State Machines](../patterns/STATE_MACHINES.md) — Entity lifecycle transitions via API
- [Frontend Guide](../guides/FRONTEND.md) — Frontend consumption of the API
- [Getting Started](../guides/GETTING_STARTED.md) — Running the API server locally
