# Agent Instructions for zerotrust

This repository's canonical agent context is [`CLAUDE.md`](./CLAUDE.md). All coding agents (Codex, Claude Code, OpenCode, Hermes, Copilot-style agents, and future agentic tools) must read and follow it before editing code.

## Mandatory security rules

The Security hardening rules table in `CLAUDE.md` is authoritative. Re-introducing any of these patterns is a review blocker:

- **CWE-601 Open redirect:** request-supplied redirects must go through `safeRelativeRedirect()` or registered OAuth/OIDC redirect allowlists.
- **CWE-918 SSRF:** user-influenced server-side fetch hosts must go through `assertSafeFetchHost()` / `assertSafeFetchUrl()` from `src/shared/safeFetch.ts` and fetch with `redirect: "error"` plus `AbortSignal.timeout(...)`. Fixed provider URLs and operator-controlled internal sinks still need timeout + no redirects.
- **CWE-78 OS command injection:** never use `shell: true` with user data; pass literal argv arrays with `shell: false`. Only documented Windows npm shim exceptions may gate shell use on `process.platform === "win32"`.
- **CWE-22 Path traversal / unsafe upload keys:** stored filenames and object keys must be server-derived and use extensions from validated content types (`safeExtensionForContentType`, `ALLOWED_AVATAR_TYPES`), never from client filenames.
- **CWE-532 Secrets in logs/URLs:** never log raw tokens/secrets/passwords/OTP values, never put access/refresh tokens in redirect URLs, and never put OAuth provider tokens/client secrets in outbound request URLs; use short-lived exchange codes, POST bodies, or `Authorization` headers.
- **CWE-1333 ReDoS / regex injection:** never interpolate unescaped user input into `new RegExp`; escape or use literal string operations.
- **CWE-327 Broken/risky crypto:** SHA-256+, AES-256-GCM, CSPRNG tokens only; SHA-1 only for HIBP protocol; static-salt backup key derivation is deprecated in favor of `BACKUP_ENCRYPTION_KEY_HEX`.
- **CWE-1427 External control of identifier:** escape/validate LDAP filters, DB identifiers, object keys, and hostnames; use Drizzle parameterized `sql`/query builder, not raw interpolation.

Before opening a PR touching auth, crypto, uploads, webhooks/fetches, filesystem, command execution, OAuth/OIDC/SAML/MFA/WebAuthn, or logging, re-scan the diff against these rules.
