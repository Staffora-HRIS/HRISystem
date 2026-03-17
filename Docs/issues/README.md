# Known Issues & Technical Debt

Detailed issue specifications organized by category, documenting known problems, compliance gaps, security concerns, and technical debt across the Staffora platform.

## Categories

| Category | Count | Description |
|----------|-------|-------------|
| `architecture-*` | 8 | Architectural issues (graceful shutdown, SPOFs, connection pools, cache races, inline SQL) |
| `compliance-*` | 12 | UK compliance gaps (right-to-work, SSP, family leave, pensions, HMRC, GDPR, equality) |
| `security-*` | 8 | Security concerns (CSRF, email verification, lockout, password policy, GDPR endpoints, body limits) |
| `tech-debt-*` | 10 | Technical debt (unused packages, driver duplication, dependency mismatches, hollow tests, N+1 queries) |

**Total: 38 tracked issues**

## Naming Convention

Files follow the pattern `category-NNN-description.md` where:
- `category` is one of: `architecture`, `compliance`, `security`, `tech-debt`
- `NNN` is a zero-padded sequential number within the category
- `description` is a short kebab-case summary

## Other Files

| File | Description |
|------|-------------|
| [REPORTING_SYSTEM_PROMPT.md](REPORTING_SYSTEM_PROMPT.md) | Prompt template used for generating issue reports |

## Related Documentation

- [Docs/audit/](../audit/) -- System audit reports that identify these issues
- [Docs/audit/technical-debt-report.md](../audit/technical-debt-report.md) -- Technical debt overview
- [Docs/audit/security-audit.md](../audit/security-audit.md) -- Security audit findings
- [Docs/compliance/](../compliance/) -- Compliance documentation and requirements
