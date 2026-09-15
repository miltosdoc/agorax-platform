# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.0   | ✅                 |
| < 0.1.0 | ❌                 |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly:

### How to Report

1. **Report privately**: Use [GitHub Security Advisories](https://github.com/miltosdoc/agorax-platform/security/advisories/new)
2. **Subject**: `[AgoraX Security] Brief description`
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: Within 24 hours
- **Initial Assessment**: Within 48 hours
- **Resolution Timeline**: 7-30 days depending on severity
- **Disclosure**: Coordinated disclosure after fix is deployed

### Severity Levels

| Level | Response Time | Description |
|-------|---------------|-------------|
| Critical | 24 hours | Remote code execution, data breach, authentication bypass |
| High | 48 hours | Privilege escalation, SQL injection, XSS |
| Medium | 1 week | CSRF, SSRF, information disclosure |
| Low | 2 weeks | Minor issues, best practices |

### What Not to Do

- Do not exploit the vulnerability
- Do not disclose publicly before we have a fix
- Do not use automated scanning tools without permission
- Do not access production systems

### Recognition

We recognize security researchers who report vulnerabilities responsibly. Your name will be included in:
- Release notes
- `SECURITY.md` acknowledgments
- README contributors section

### Security Features

AgoraX implements several security measures:

- **CSPRNG-backed sortition** with rejection sampling
- **Rate limiting** on all API endpoints
- **Input validation** with Zod schemas
- **Parameterized queries** (Drizzle ORM)
- **Structured logging** for security events
- **Health check** endpoint for monitoring
- **Docker security** with non-root user
- **CI/CD pipeline** with automated security checks

### Security Audit

A comprehensive security audit checklist is available in `docs/SECURITY_AUDIT.md`.

### Contact

For security-related inquiries, contact:
- **GitHub Security Advisories**: [Report a vulnerability](https://github.com/miltosdoc/agorax-platform/security/advisories/new)

Thank you for helping keep AgoraX secure! 🔒
