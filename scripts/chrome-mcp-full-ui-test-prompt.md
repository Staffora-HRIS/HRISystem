# Full UI Smoke Test Prompt — Staffora HRIS

Copy and paste the prompt below into Claude Code to run a comprehensive Chrome MCP browser test across every page and button in the Staffora HRIS system. It uses parallel agents — one per module — for speed.

---

## PROMPT

```
You are a QA test coordinator. Your job is to orchestrate a comprehensive UI smoke test of the Staffora HRIS system running at http://localhost:5173 using Chrome MCP browser automation.

IMPORTANT: You MUST use the Agent tool to launch one dedicated agent per module section below. Launch as many agents in parallel as possible. Each agent will independently test its assigned pages using Chrome MCP tools.

Before launching agents: use ToolSearch to load tabs_context_mcp and tabs_create_mcp, then call tabs_context_mcp to verify the browser is accessible. Then create one tab and navigate to http://localhost:5173/login to confirm the app is running. Take a screenshot to confirm.

LOGIN CREDENTIALS: email = admin@staffora.co.uk, password = Admin123!@#

Once confirmed, launch ALL of the following agents in parallel. Each agent gets its own section of pages to test.

---

## SHARED AGENT INSTRUCTIONS (include in every agent prompt)

Each agent must follow these rules:

1. Before ANY mcp__claude-in-chrome__* tool call, load it with ToolSearch first (e.g., ToolSearch "select:mcp__claude-in-chrome__navigate")
2. Create your own tab with tabs_create_mcp — do NOT reuse tabs from other agents
3. Navigate to http://localhost:5173/login first, log in with: email = admin@staffora.co.uk, password = Admin123!@#
4. After login, begin testing your assigned pages
5. Do NOT trigger JavaScript alerts/confirms/prompts — they block the browser extension
6. Do NOT click Delete/Remove/Destroy buttons — only test non-destructive actions
7. If a page fails to load after 2 attempts, log FAIL and move on

FOR EACH PAGE:
a) Navigate to the URL
b) Use read_page to verify content loaded (headings, tables, forms)
c) Use read_console_messages with pattern "error|Error|ERR|fail|exception|uncaught" to catch JS errors
d) Use find tool to locate buttons, links, dropdowns, tabs
e) Click each primary action button (Add, Create, New, Edit, Export, Filter) — verify modals open, then close them
f) Click each tab if the page has tabs
g) Test search/filter inputs if present
h) Test pagination if present

OUTPUT: Return a markdown table with results:
| Page | URL | Status | Issues |
|------|-----|--------|--------|

Status = PASS (all good), WARN (console errors or missing elements), FAIL (page broken)

Also list any modals/buttons tested and their results.

---

## AGENT 1: Authentication & Home

Test these pages:
- /login — Test empty submission validation, then log in successfully
- /forgot-password — Verify form renders
- /mfa — Verify it renders or redirects
- / — Verify redirect to /login or /dashboard
- Record GIF: "auth_test.gif"

## AGENT 2: Employee Self-Service (My Pages)

Log in, then test:
- /dashboard — Check all cards/widgets render
- /me — Self-service hub
- /me/profile — Check edit buttons, form fields
- /me/bank-details — Check view/edit
- /me/emergency-contacts — Check add/edit buttons
- /me/documents — Check upload button, document list
- /me/leave — Check "Request Leave" button, calendar
- /me/time — Check clock in/out buttons
- /me/benefits — Check benefit cards
- /me/learning — Check enrollment buttons
- /me/cases — Check "New Case" button
- /me/competencies — Check self-assessment
- /me/change-requests — Check pending requests
- /me/directory — Check search, filters, employee cards
- /me/onboarding — Check checklist items
- /me/org-chart — Check zoom, expand/collapse nodes
- Record GIF: "self_service_test.gif"

## AGENT 3: Manager Portal

Log in, then test:
- /manager — Manager hub index
- /manager/dashboard — Manager dashboard with team widgets
- /manager/team — Team list, filters, action buttons
- /manager/approvals — Approvals inbox index
- /manager/approvals/leave — Leave approval queue, approve/reject buttons
- /manager/approvals/timesheets — Timesheet approvals
- /manager/approvals/expenses — Expense approvals
- /manager/performance — Team performance reviews
- /manager/schedules — Team schedule management
- /manager/org-chart — Manager org chart view
- Record GIF: "manager_portal_test.gif"

## AGENT 4: HR Core Module

Log in, then test:
- /admin/hr — HR module hub
- /admin/hr/employees — Employee list: search, filters, "Add Employee" button, pagination, click into a row
- /admin/hr/departments — Departments list, add/edit buttons
- /admin/hr/positions — Positions list, CRUD buttons
- /admin/hr/jobs — Job catalogue
- /admin/hr/org-chart — Admin org chart, zoom, node interactions
- /admin/hr/organization — Org units/structure
- /admin/hr/contracts — Employee contracts
- /admin/hr/contract-amendments — Contract amendments
- /admin/hr/contract-statements — Written statements
- /admin/hr/bank-details — Bank details admin
- /admin/hr/emergency-contacts — Emergency contacts admin
- /admin/hr/equipment — Equipment tracking
- /admin/hr/adjustments — Employee adjustments
- /admin/hr/warnings — Disciplinary warnings
- /admin/hr/probation — Probation management
- /admin/hr/secondments — Secondments
- /admin/hr/flexible-working — Flexible working requests
- /admin/hr/headcount-planning — Headcount planning
- Record GIF: "hr_core_test.gif"

## AGENT 5: Leave & Absence Module

Log in, then test:
- /admin/absence — Absence module index
- /admin/leave — Leave module index
- /admin/leave/requests — Leave requests list, approve/reject/cancel buttons, filters
- /admin/leave/types — Leave types config, add/edit
- /admin/leave/policies — Leave policies, CRUD
- /admin/leave/statutory — Statutory leave entitlements
- /admin/leave/ssp — Statutory Sick Pay calculations
- /admin/leave/bereavement — Bereavement leave
- /admin/leave/carers — Carer's leave
- /admin/leave/parental — Parental leave
- /admin/leave/return-to-work — Return to work interviews
- Record GIF: "leave_absence_test.gif"

## AGENT 6: Time & Attendance Module

Log in, then test:
- /admin/time — Time module index
- /admin/time/timesheets — Timesheets list, filters, approval buttons
- /admin/time/schedules — Work schedules, create/edit
- /admin/time/policies — Time policies
- /admin/time/reports — Time reports
- /admin/time/geofence — Geofence configuration, map/radius inputs
- Record GIF: "time_attendance_test.gif"

## AGENT 7: Payroll Module

Log in, then test:
- /admin/payroll — Payroll index
- /admin/payroll/runs — Payroll runs, "New Run" button, status badges
- /admin/payroll/schedules — Pay schedules
- /admin/payroll/payslips — Payslip generation/list
- /admin/payroll/deductions — Deduction types
- /admin/payroll/tax-codes — Tax code management
- /admin/payroll/tax-details — Employee tax details
- /admin/payroll/ni-categories — National Insurance categories
- /admin/payroll/bank-holidays — Bank holiday calendar
- /admin/payroll/pension — Pension auto-enrolment, schemes table, enrolments, compliance dashboard tabs
- Record GIF: "payroll_test.gif"

## AGENT 8: Talent & Recruitment Module

Log in, then test:
- /admin/talent — Talent module index
- /admin/talent/performance — Performance reviews, cycle management
- /admin/talent/goals — Goals management
- /admin/talent/competencies — Competency frameworks
- /admin/talent/succession — Succession planning
- /admin/talent/recruitment — Recruitment index
- /admin/talent/recruitment/candidates — Candidate pipeline, filters, stage buttons
- /admin/talent/recruitment/agencies — Recruitment agencies
- /admin/talent/recruitment/assessments — Assessment management
- /admin/talent/recruitment/dbs-checks — DBS check tracking
- /admin/talent/recruitment/reference-checks — Reference checks
- Record GIF: "talent_recruitment_test.gif"

## AGENT 9: LMS Module

Log in, then test:
- /admin/lms — LMS index
- /admin/lms/courses — Course catalogue, CRUD buttons
- /admin/lms/paths — Learning paths
- /admin/lms/assignments — Course assignments
- /admin/lms/budgets — Training budgets
- /admin/lms/cpd — CPD tracking
- /admin/lms/ratings — Course ratings/feedback
- Record GIF: "lms_test.gif"

## AGENT 10: Cases, Onboarding & Benefits

Log in, then test:
- /admin/cases — Cases list, filters, status badges, "New Case" button
- /admin/onboarding — Onboarding index
- /admin/onboarding/active — Active onboarding processes
- /admin/onboarding/templates — Onboarding templates, CRUD
- /admin/benefits — Benefits index
- /admin/benefits/enrollments — Benefits enrollment management
- /admin/documents/templates — Document templates
- /admin/documents/contracts — Contract documents
- /admin/documents/letters — Letter generation
- Record GIF: "cases_onboarding_benefits_test.gif"

## AGENT 11: Compliance & Privacy (GDPR)

Log in, then test:
- /admin/compliance — Compliance index
- /admin/compliance/right-to-work — Right to work checks
- /admin/compliance/health-safety — Health & Safety
- /admin/compliance/diversity — Equality & Diversity
- /admin/compliance/gender-pay-gap — Gender pay gap reporting
- /admin/compliance/nmw — National Minimum Wage
- /admin/compliance/wtr — Working Time Regulations
- /admin/compliance/dsar — Data Subject Access Requests
- /admin/compliance/data-retention — Data retention
- /admin/compliance/data-breach — Data breach register
- /admin/privacy — Privacy index
- /admin/privacy/dsar — DSAR management
- /admin/privacy/data-erasure — Data erasure requests
- /admin/privacy/data-breach — Data breach notifications
- /admin/privacy/consent — Consent management
- /admin/privacy/notices — Privacy notices
- /admin/privacy/privacy-notices — Privacy notice templates
- Record GIF: "compliance_privacy_test.gif"

## AGENT 12: Reports, Analytics & Workflows

Log in, then test:
- /admin/analytics — Analytics dashboard, verify charts render
- /admin/reports — Reports list, report cards
- /admin/reports/templates — Report templates
- /admin/reports/favourites — Favourite reports
- /admin/reports/new — New report builder, check field catalog, filter builder, column configurator
- /admin/workflows — Workflow index
- /admin/workflows/templates — Workflow templates
- /admin/workflows/builder — Visual workflow builder, check node adding
- Record GIF: "reports_analytics_workflows_test.gif"

## AGENT 13: Security & Settings

Log in, then test:
- /admin/security — Security index
- /admin/security/users — User management, CRUD, status toggles
- /admin/security/roles — Role management, permission checkboxes
- /admin/security/permissions — Permissions matrix
- /admin/security/audit-log — Audit log viewer, filters, pagination
- /admin/security/delegations — Delegation management
- /admin/settings — Settings index
- /admin/settings/tenant — Tenant settings, save button
- /admin/settings/appearance — Theme/appearance
- /admin/settings/notifications — Notification preferences
- /admin/settings/integrations — Integration configuration
- /admin/settings/lookup-values — Lookup values, CRUD
- /admin/settings/bank-holidays — Bank holidays
- /admin/settings/delegations — Delegation settings
- Record GIF: "security_settings_test.gif"

---

## AFTER ALL AGENTS COMPLETE

Collect all agent results and produce a final consolidated report:

### Final Test Results Summary

| # | Module | Pages Tested | PASS | WARN | FAIL | Agent |
|---|--------|-------------|------|------|------|-------|
| 1 | Auth | X | X | X | X | Agent 1 |
| 2 | Self-Service | X | X | X | X | Agent 2 |
| ... | ... | ... | ... | ... | ... | ... |

### Overall Statistics
- Total pages tested: X
- Total PASS: X
- Total WARN: X
- Total FAIL: X
- Pass rate: X%

### Critical Failures (FAIL)
List every page that completely failed, with the error description.

### Warnings
List pages with non-critical issues.

### Buttons & Modals Successfully Tested
List the key interactive elements that were verified working.

### GIF Recordings
List all GIF files recorded with their file paths.

BEGIN NOW — first verify the app is accessible, then launch all 13 agents in parallel.
```
