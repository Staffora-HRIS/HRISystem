## Summary
<!-- 1-3 bullet points describing what this PR does -->

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Database migration
- [ ] Infrastructure / DevOps
- [ ] Documentation

## Checklist
- [ ] My code follows the project's coding standards
- [ ] I have performed a self-review of my code
- [ ] New and existing tests pass locally (`bun test`)
- [ ] Type checking passes (`bun run typecheck`)
- [ ] Linting passes (`bun run lint`)

### If this includes a database migration:
- [ ] Migration follows 4-digit naming convention (`NNNN_description.sql`)
- [ ] New tables include `tenant_id` column
- [ ] RLS is enabled with tenant isolation policies
- [ ] Migration is reversible or has a documented rollback plan

### If this includes API changes:
- [ ] TypeBox schemas are defined for request/response
- [ ] Error responses follow standard format
- [ ] Idempotency is handled for mutating endpoints
- [ ] Domain events written to outbox in same transaction

## Test Plan
<!-- How has this been tested? What test cases were added? -->

## Related Issues
<!-- Closes #123 -->
