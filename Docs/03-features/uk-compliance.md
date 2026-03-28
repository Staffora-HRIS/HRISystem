# UK Compliance

## Overview

Staffora is built exclusively for UK employers and includes comprehensive compliance modules covering employment law, tax and payroll regulations, health and safety requirements, GDPR data protection obligations, and sector-specific checks. This document provides a summary of all compliance modules and the legislation they implement. For detailed compliance documentation, see [docs/12-compliance/](../12-compliance/README.md).

## UK Employment Law Modules

| # | Module | Legislation | Description |
|---|--------|-------------|-------------|
| 1 | `ssp` | Social Security Contributions and Benefits Act 1992, Statutory Sick Pay (General) Regulations 1982 | Statutory Sick Pay calculation, waiting days, qualifying days, linked periods of incapacity, SSP1 form generation |
| 2 | `statutory-leave` | Working Time Regulations 1998, Employment Rights Act 1996 | Statutory annual leave entitlement (5.6 weeks / 28 days), bank holiday inclusion, pro-rata calculation for part-time workers |
| 3 | `family-leave` | Employment Rights Act 1996, Maternity and Parental Leave etc. Regulations 1999 | Maternity, paternity, adoption, and shared parental leave management with pay calculations |
| 4 | `parental-leave` | Employment Rights Act 1996, Maternity and Parental Leave etc. Regulations 1999 | Unpaid parental leave (18 weeks per child until age 18), notice requirements, postponement rules |
| 5 | `bereavement` | Parental Bereavement (Leave and Pay) Act 2018 (Jack's Law) | Parental bereavement leave (2 weeks), general bereavement leave policies |
| 6 | `carers-leave` | Carer's Leave Act 2023 | Unpaid carer's leave (1 week per year from day one), notice requirements, eligibility |
| 7 | `pension` | Pensions Act 2008, The Workplace Pension Regulations 2012 | Auto-enrolment pension management, opt-in/opt-out, re-enrolment, contribution calculations, qualifying earnings |
| 8 | `nmw` | National Minimum Wage Act 1998, National Minimum Wage Regulations 2015 | NMW/NLW compliance checking, rate validation by age band, salary sacrifice floor enforcement |
| 9 | `right-to-work` | Immigration, Asylum and Nationality Act 2006 | Right to work document verification, share codes, expiry tracking, repeat checks for time-limited permissions |
| 10 | `dbs-checks` | Rehabilitation of Offenders Act 1974, Police Act 1997 | DBS check management (basic, standard, enhanced), update service integration, barred list checks |
| 11 | `wtr` | Working Time Regulations 1998 | Maximum 48-hour weekly limit (opt-out tracking), rest period enforcement (11h daily, 24h weekly), night work limits |
| 12 | `probation` | Employment Rights Act 1996, Employment Rights (Amendment) Regulations | Probation period management, extension tracking, review scheduling |
| 13 | `flexible-working` | Employment Relations (Flexible Working) Act 2023 | Flexible working request management, statutory decision timeline (2 months), appeal process |
| 14 | `warnings` | ACAS Code of Practice on Disciplinary and Grievance Procedures | Progressive discipline: verbal, written, final written warnings with expiry periods and appeal rights |
| 15 | `tribunal` | Employment Tribunals Act 1996, Employment Tribunals Rules of Procedure 2013 | Employment tribunal case tracking, ET1/ET3 management, hearing dates, costs |
| 16 | `whistleblowing` | Public Interest Disclosure Act 1998 (PIDA) | Protected disclosure management, anonymous reporting, designated officer workflow, detriment protection recording |
| 17 | `suspensions` | Employment Rights Act 1996 (s.64-65 medical suspension) | Employee suspension management with/without pay, review dates, reinstatement |
| 18 | `tupe` | Transfer of Undertakings (Protection of Employment) Regulations 2006 | TUPE transfer management, employee information, consultation tracking |
| 19 | `ir35` | Finance Act 2000 (amended 2017, 2021) | Off-payroll working rules, status determination statements, contractor assessments |
| 20 | `health-safety` | Health and Safety at Work etc. Act 1974 | Workplace incident reporting, risk assessments, RIDDOR notifications |
| 21 | `gender-pay-gap` | Equality Act 2010 (Specific Duties and Public Authorities) Regulations 2017 | Gender pay gap reporting, mean/median calculations, quartile analysis |
| 22 | `sickness-analytics` | -- | Absence pattern analysis, trigger point monitoring, Bradford Factor, return-to-work tracking |
| 23 | `return-to-work` | -- | Return-to-work interview management following absence periods |
| 24 | `reasonable-adjustments` | Equality Act 2010 | Disability reasonable adjustment tracking and workplace modification records |
| 25 | `secondments` | -- | Internal and external secondment management with return dates |
| 26 | `global-mobility` | Various (immigration, tax, social security) | International assignment tracking, visa management, tax equalisation |

## GDPR and Data Protection Modules

| # | Module | Legislation | Description |
|---|--------|-------------|-------------|
| 1 | `dsar` | UK GDPR Article 15, Data Protection Act 2018 | Data Subject Access Request management, 1-month response deadline, identity verification |
| 2 | `data-erasure` | UK GDPR Article 17 | Right to erasure (right to be forgotten) request processing with lawful basis evaluation |
| 3 | `data-breach` | UK GDPR Articles 33-34, Data Protection Act 2018 | Personal data breach recording, ICO notification within 72 hours, affected individual notification |
| 4 | `consent` | UK GDPR Articles 6-7 | Consent collection, withdrawal tracking, purpose limitation, granular consent management |
| 5 | `privacy-notices` | UK GDPR Articles 13-14 | Privacy notice versioning, distribution, and acknowledgement tracking |
| 6 | `data-retention` | UK GDPR Article 5(1)(e) | Retention schedule management, automated purge scheduling, retention period enforcement |
| 7 | `dpia` | UK GDPR Article 35 | Data Protection Impact Assessment creation and management for high-risk processing |
| 8 | `ropa` | UK GDPR Article 30 | Records of Processing Activities maintenance |
| 9 | `data-archival` | UK GDPR, Data Protection Act 2018 | Data archival and purge management for expired records |

## Compliance Architecture

All compliance modules share the platform's core architecture patterns:

- **Multi-tenant RLS**: Every compliance record is tenant-isolated via Row-Level Security
- **Audit trail**: All compliance actions are recorded in the audit log via the outbox pattern
- **Effective dating**: Time-sensitive compliance data (e.g. right-to-work expiry, pension opt-out) uses the effective dating pattern
- **Idempotency**: All mutating operations support idempotency keys to prevent duplicate processing
- **Background jobs**: Automated compliance tasks (e.g. pension re-enrolment, warning expiry, data retention purge) are handled by the worker subsystem

## Further Reading

- [UK Compliance Audit Report](../12-compliance/uk-compliance-audit.md)
- [UK HR Compliance Report](../12-compliance/uk-hr-compliance-report.md)
- [Compliance Issues](../12-compliance/issues/)
- [Security Patterns (RLS, Auth, RBAC)](../07-security/README.md)

---

## Related Documents

- [Architecture Overview](../02-architecture/ARCHITECTURE.md) — System architecture, plugin chain, and request flow
- [API Reference](../04-api/api-reference.md) — Full endpoint specifications for compliance modules
- [GDPR Compliance](../12-compliance/gdpr-compliance.md) — Data protection regulations and implementation details
- [UK Employment Law](../12-compliance/uk-employment-law.md) — Detailed UK employment law reference
- [Data Protection](../07-security/data-protection.md) — DSAR, data erasure, consent, and breach notification
- [RLS and Multi-Tenancy](../07-security/rls-multi-tenancy.md) — Row-Level Security ensuring tenant data isolation
- [Testing Guide](../08-testing/testing-guide.md) — Integration test patterns for compliance feature verification

---

Last updated: 2026-03-28
