# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email security concerns to the maintainers
3. Include a description of the vulnerability and steps to reproduce
4. Allow reasonable time for a fix before public disclosure

## Security Measures

This project implements:
- Row-Level Security (RLS) for multi-tenant data isolation
- HMAC-signed CSRF tokens
- Rate limiting on authentication endpoints
- Input validation via TypeBox schemas
- HttpOnly secure session cookies
- Automated dependency scanning via Dependabot
- Container image scanning via Trivy
