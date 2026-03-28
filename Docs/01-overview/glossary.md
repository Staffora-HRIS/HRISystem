# Glossary

> Definitions of HRIS, UK employment law, GDPR, and Staffora-specific terms used across the platform documentation.
> *Last updated: 2026-03-28*

---

## Platform and Architecture Terms

| Term | Definition |
|------|-----------|
| **Tenant** | An isolated customer organisation within the Staffora platform. Each tenant's data is separated at the database level using Row-Level Security (RLS). |
| **RLS (Row-Level Security)** | A PostgreSQL feature that enforces data isolation by restricting which rows a database role can access. Every tenant-owned table has RLS policies keyed on `tenant_id`. |
| **Effective Dating** | A pattern for recording data changes with `effective_from` / `effective_to` date ranges. Used for positions, compensation, contracts, and other temporal HR data. A `NULL` value for `effective_to` indicates the record is currently active. |
| **Outbox Pattern** | A reliability pattern where domain events are written to a `domain_outbox` table in the same database transaction as the business write. A background poller publishes these events to Redis Streams for asynchronous processing. |
| **Idempotency Key** | A unique key sent via the `Idempotency-Key` HTTP header on mutating requests. Scoped to `(tenant_id, user_id, route_key)`, it prevents duplicate writes if a request is retried. Keys expire after 24-72 hours. |
| **State Machine** | A model that defines valid states and transitions for an entity. Staffora uses five state machines: employee lifecycle, leave request, case management, workflow, and performance cycle. Transitions are enforced in code and logged immutably. |
| **Plugin Chain** | The ordered sequence of Elysia.js plugins that process every API request. Plugins build up context (database, cache, auth, tenant, RBAC, audit) and must be registered in a specific dependency order. |
| **Cursor-Based Pagination** | A pagination strategy that uses an opaque cursor token to traverse result sets, instead of page-number offsets. More efficient for large datasets and avoids issues with concurrent inserts. |
| **Domain Event** | A record of something that happened in the system (e.g., `hr.employee.created`). Domain events are written to the outbox table and consumed by background workers to trigger side effects such as notifications, exports, and analytics. |
| **RBAC (Role-Based Access Control)** | An authorisation model where permissions are assigned to roles, and roles are assigned to users. Staffora's RBAC plugin evaluates permissions on every request. |
| **Feature Flag** | A configuration toggle that controls whether a feature is enabled for a specific tenant. Evaluated by the `featureFlagsPlugin` at request time. |
| **Monorepo** | A single repository containing multiple packages managed with Bun workspaces: `@staffora/api` (backend), `@staffora/web` (frontend), and `@staffora/shared` (shared types, schemas, utilities). |
| **System Context** | A database bypass mechanism (`app.enable_system_context()` / `app.disable_system_context()`) that temporarily disables RLS for administrative operations such as migrations or cross-tenant queries. |

## UK Employment Law Terms

| Term | Definition |
|------|-----------|
| **ACAS** | Advisory, Conciliation and Arbitration Service. An independent public body that provides guidance on workplace relations. The ACAS Code of Practice on Disciplinary and Grievance Procedures is the standard employers must follow. |
| **BRP** | Biometric Residence Permit. A document issued to non-UK nationals that confirms their right to stay, work, or study in the UK. Used in right-to-work checks. |
| **Bradford Factor** | A formula for measuring the impact of employee absence patterns. Calculated as S x S x D, where S is the number of separate absence spells and D is the total number of days absent. Higher scores indicate more disruptive absence patterns. |
| **DBS Check** | Disclosure and Barring Service check. A criminal record check required for certain roles (e.g., working with children or vulnerable adults). Levels: Basic, Standard, Enhanced, and Enhanced with Barred Lists. |
| **DSE Assessment** | Display Screen Equipment assessment. Under the Health and Safety (Display Screen Equipment) Regulations 1992, employers must assess workstations used by employees who regularly use screens. |
| **Gender Pay Gap Report** | An annual report required under the Equality Act 2010 for employers with 250+ employees. Reports six statutory metrics including mean/median pay gaps and bonus pay gaps. |
| **HMRC** | His Majesty's Revenue and Customs. The UK government department responsible for tax collection, National Insurance, and statutory pay administration. |
| **KIT Day** | Keeping In Touch day. An employee on maternity or adoption leave may work up to 10 KIT days without ending their leave or statutory pay. Shared Parental Leave allows 20 SPLIT (Shared Parental Leave In Touch) days. |
| **NI / NINO** | National Insurance / National Insurance Number. A unique identifier assigned to UK residents for tax and benefits purposes. Format: two letters, six digits, one letter (e.g., QQ 12 34 56 C). |
| **NLW (National Living Wage)** | The statutory minimum hourly pay rate for workers aged 21 and over (previously 23+). Set annually by the government. |
| **NMW (National Minimum Wage)** | The statutory minimum hourly pay rate for workers under the NLW age threshold. Different rates apply by age band. HMRC can issue penalties of 200% of any underpayment. |
| **P45 / P60** | Tax documents. A P45 is issued when an employee leaves; a P60 is an annual summary of pay and tax deductions issued by 31 May each year. |
| **RIDDOR** | Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013. Certain workplace incidents must be reported to the HSE (Health and Safety Executive). |
| **Right to Work** | The legal requirement under the Immigration, Asylum and Nationality Act 2006 for employers to verify that employees have the legal right to work in the UK before employment begins. Penalties of up to GBP 60,000 per illegal worker. |
| **SMP (Statutory Maternity Pay)** | Pay for eligible employees on maternity leave: 90% of average weekly earnings for 6 weeks, then the lower of the statutory flat rate or 90% of average earnings for 33 weeks. |
| **SOC Code** | Standard Occupational Classification code. A UK system for categorising occupations, used in government statistics and reporting. |
| **SPP (Statutory Paternity Pay)** | Statutory pay for eligible employees taking paternity leave, paid at the statutory flat rate or 90% of average weekly earnings (whichever is lower) for up to 2 weeks. |
| **SSP (Statutory Sick Pay)** | Statutory Sick Pay. Paid by employers to eligible employees who are off sick for 4+ consecutive days. Paid for up to 28 weeks per period of incapacity for work (PIW). |
| **ShPL (Shared Parental Leave)** | A scheme allowing eligible parents to share up to 50 weeks of leave and up to 37 weeks of pay between them after the birth or adoption of a child. The mother must curtail her maternity/adoption leave to create ShPL. |
| **TUPE** | Transfer of Undertakings (Protection of Employment) Regulations 2006. Protects employees' terms and conditions when a business or service provision transfers to a new employer. |
| **WTR (Working Time Regulations)** | Working Time Regulations 1998. Limits working time to a 48-hour weekly average (with opt-out), mandates 11 hours daily rest, 24 hours weekly rest, a 20-minute break per 6 hours worked, and 5.6 weeks (28 days) annual leave. |
| **Written Particulars** | A written statement of employment particulars required under the Employment Rights Act 1996, ss.1-7B. Must be provided to all employees and workers on or before their first day of work. Covers 12 legally required items. |
| **Jack's Law** | The Parental Bereavement (Leave and Pay) Act 2018. Entitles bereaved parents to 2 weeks' leave, which can be taken within 56 weeks of a child's death. |
| **Carer's Leave** | Under the Carer's Leave Act 2023, employees are entitled to 1 week of unpaid leave per year to provide care for a dependant with a long-term care need. Available from day one of employment. |
| **Flexible Working** | Under the Employment Relations (Flexible Working) Act 2023, employees can request changes to their work pattern, hours, or location from day one. Employers must respond within 2 months and can only refuse on 8 statutory grounds. |
| **Pension Auto-Enrolment** | Under the Pensions Act 2008, employers must automatically enrol eligible workers into a qualifying workplace pension scheme. Three worker categories: eligible jobholders, non-eligible jobholders, and entitled workers. |

## GDPR and Data Protection Terms

| Term | Definition |
|------|-----------|
| **UK GDPR** | The EU General Data Protection Regulation as retained in UK law by the European Union (Withdrawal) Act 2018, supplemented by the Data Protection Act 2018. Governs the processing of personal data in the UK. |
| **ICO** | Information Commissioner's Office. The UK's independent supervisory authority for data protection. Has the power to issue fines, conduct audits, and require organisations to take specific actions. |
| **Data Subject** | An identified or identifiable natural person whose personal data is processed. In the HRIS context, this is typically an employee. |
| **DSAR** | Data Subject Access Request. A request from a data subject to exercise their rights under Articles 15-20 of the UK GDPR (access, rectification, erasure, restriction, portability). Must be responded to within 30 calendar days. |
| **Data Erasure (Right to be Forgotten)** | The right under Article 17 to have personal data erased. Subject to statutory retention conflicts (e.g., payroll records must be kept for 6 years). Staffora implements a four-eyes approval principle. |
| **Consent** | Under Articles 6-7, one of six lawful bases for processing personal data. Must be freely given, specific, informed, and unambiguous. Can be withdrawn at any time. |
| **DPIA** | Data Protection Impact Assessment. Required under Article 35 before processing that is likely to result in a high risk to individuals' rights and freedoms. Must be completed before processing begins. |
| **ROPA** | Records of Processing Activities. Required under Article 30. A register documenting all processing activities, their purposes, legal bases, data categories, retention periods, and security measures. Must be current at all times as the ICO can request it without notice. |
| **Privacy Notice** | A document provided to data subjects under Articles 13-14 explaining what personal data is collected, why, the legal basis, retention periods, and their rights. Must be provided at the point of data collection. |
| **Data Breach** | A security incident leading to the accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to personal data. The ICO must be notified within 72 hours if there is a likely risk to individuals. |
| **Data Retention** | The principle under Article 5(1)(e) that personal data should be kept no longer than necessary for the purpose it was collected. Staffora supports per-category retention policies. |
| **Data Controller** | The organisation that determines the purposes and means of processing personal data. Each tenant is a data controller; Staffora acts as data processor. |
| **Data Processor** | An organisation that processes personal data on behalf of a data controller. Staffora (the platform) is the data processor for each tenant. |

## HR Domain Terms

| Term | Definition |
|------|-----------|
| **FTE (Full-Time Equivalent)** | A unit expressing an employee's workload as a proportion of a full-time schedule. An employee working 20 hours in a 40-hour week has an FTE of 0.5. |
| **Headcount** | The number of approved positions or actual employees in an organisational unit. Position headcount tracks budgeted vs filled roles. |
| **Cost Centre** | A business unit or department to which costs are allocated for financial reporting. Employees and positions are assigned to cost centres. |
| **Org Unit** | An organisational unit representing a node in the company hierarchy. Types include company, division, department, team, and group. |
| **Position** | A defined role within the organisation with a title, grade, reporting line, and compensation range. Multiple employees can share the same position (e.g., 5 headcount for "Software Engineer"). |
| **Job Family** | A grouping of related positions that share similar skill requirements and career paths (e.g., "Engineering", "Finance", "Human Resources"). |
| **Job Grade** | A classification level within a job family that determines compensation bands and career progression. |
| **Requisition** | A formal request to fill a position. Goes through an approval workflow before a vacancy is opened for candidates. |
| **Onboarding** | The structured process of integrating a new hire into the organisation, including paperwork, training, equipment provisioning, and introductions. |
| **Offboarding** | The structured process of managing an employee's departure, including knowledge transfer, equipment return, access revocation, and exit interviews. |
| **Probation** | A trial period at the start of employment during which performance is assessed. Can be extended or ended early based on reviews. |
| **Secondment** | A temporary transfer of an employee to a different role, department, or organisation, with the expectation of returning to their original position. |
| **SLA (Service Level Agreement)** | In case management, a defined target for response and resolution times. Cases track SLA compliance and trigger escalations when deadlines approach. |
| **Accrual** | The gradual accumulation of leave entitlement over time, based on rules such as frequency, tenure tiers, and proration for new hires. |
| **Carryover** | Leave balance that is transferred from one year to the next. May be capped (e.g., maximum 5 days) and subject to expiration. |
| **Leave Ledger** | An append-only record of all changes to an employee's leave balance (accruals, usage, adjustments, forfeitures, carryovers). Provides a complete audit trail. |
| **Performance Cycle** | A time-bound period (typically annual) during which goals are set, reviewed, and calibrated. States: draft, active, review, calibration, completed. |
| **Calibration** | A process during a performance cycle where managers collectively review and normalise ratings to ensure fairness and consistency across the organisation. |
| **Competency** | A measurable skill, behaviour, or attribute that defines effective performance in a role. Competencies are tracked, assessed, and developed through the LMS and talent modules. |
| **Learning Path** | An ordered sequence of courses and activities in the LMS designed to develop a specific skill set or prepare an employee for a role. |
| **Succession Plan** | A process for identifying and developing employees who could fill key leadership or critical positions in the future. |

## Technical Terms

| Term | Definition |
|------|-----------|
| **Bun** | A fast JavaScript/TypeScript runtime, bundler, and package manager used as the primary runtime for Staffora's backend and build tooling. |
| **Elysia.js** | A TypeScript web framework built for Bun, used for the Staffora API. Supports a plugin-based architecture with end-to-end type safety. |
| **TypeBox** | A JSON Schema type builder that generates TypeScript types from schemas. Used for request/response validation in API endpoints. |
| **BetterAuth** | The authentication library used for session management, multi-factor authentication (MFA), and CSRF protection. Manages its own tables and supports password hashing with both bcrypt (legacy) and scrypt (current). |
| **postgres.js** | A PostgreSQL client for Node.js/Bun that uses tagged template literals for parameterised queries. Provides automatic `snake_case` to `camelCase` column transforms. |
| **Redis Streams** | A Redis data structure used for reliable message queuing. Staffora uses Redis Streams for asynchronous job processing, including the outbox poller, notification worker, export worker, and PDF worker. |
| **React Query (TanStack Query)** | A data-fetching and caching library for React used on the Staffora frontend. Manages server state, caching, background refetching, and optimistic updates. |
| **CSRF (Cross-Site Request Forgery)** | An attack where a malicious site tricks a user's browser into making unwanted requests. Staffora uses CSRF tokens validated by the BetterAuth plugin. |
| **MFA (Multi-Factor Authentication)** | An authentication method requiring two or more verification factors. Staffora supports TOTP (time-based one-time password) and backup codes via BetterAuth. |
| **SCORM** | Sharable Content Object Reference Model. A set of standards for e-learning content interoperability. Supported as a content type in the LMS module. |
| **Audit Trail** | An immutable, append-only log of all significant actions taken in the system, including who did what, when, and from where. Written by the `auditPlugin`. |

---

## See Also

- [System Documentation](system-documentation.md) -- comprehensive platform reference
- [Module Catalog](module-catalog.md) -- all 120 backend modules by category
- [UK Employment Law Compliance](../12-compliance/uk-employment-law.md) -- detailed compliance module documentation
- [GDPR Compliance](../12-compliance/gdpr-compliance.md) -- data protection module documentation
- [State Machines](../06-patterns/STATE_MACHINES.md) -- state machine diagrams and transition rules
- [Error Codes](../04-api/error-codes.md) -- API error codes by module
