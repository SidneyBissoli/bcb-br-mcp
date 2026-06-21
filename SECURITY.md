# Security Policy

## Supported Versions

Only the latest published version receives security fixes. The package
has no long-term-support branches — upgrade to the most recent release
to stay patched.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Reporting a Vulnerability

Please report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/SidneyBissoli/bcb-br-mcp/security/advisories/new)
— do **not** open a public issue for security problems.

If you cannot use GitHub, email **sbissoli76@gmail.com** with
`[SECURITY]` in the subject line.

What to expect:

- **Acknowledgment** within 7 days.
- **Assessment and fix timeline** communicated after triage. Fixes ship
  as a patch release to npm.
- **Credit** in the release notes, unless you prefer to remain anonymous.

## Scope notes

- This server is a read-only proxy over the Banco Central do Brasil (BCB) SGS public time-series API. It stores no user data and requires no credentials.
- Reports about upstream API behavior should go to the respective
  upstream maintainers; this project can only mitigate, not fix,
  upstream issues.
