# Security Policy

## Supported versions

zerotrust is pre-1.0 and under active development. The latest `main` branch is
the only supported version. Security fixes are backported to the most recent
release tag when applicable.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| Tags    | Latest only        |

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

Email `SECURITY_CONTACT` (set in `.env`, exposed at `/.well-known/security.txt`
per RFC 9116). If no contact is configured, open a private security advisory via
GitHub's **Report a vulnerability** feature on the **Security** tab.

You will receive an acknowledgement within 48 hours. If the report is accepted,
expect a fix timeline and coordinated disclosure plan within 7 days.

## Security measures in this codebase

- **Tokens** — PASETO v4 (AES-256-GCM), no JWT `alg: none` footguns.
- **Passwords** — bcrypt hashing.
- **Secrets** — `.env` files are git-ignored; never commit credentials.
- **Audit** — tamper-evident SHA-256 hash-chained audit log.
- **CWE coverage** — see the mandatory security rules table in [`CLAUDE.md`](./CLAUDE.md)
  and [`AGENTS.md`](./AGENTS.md) (CWE-601, 918, 78, 22, 532, 1333, 327, 1427).
