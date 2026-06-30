# ADR 006: Token Storage and Rotation Strategy

**Status:** Accepted
**Date:** 2026-01 (initial), documented 2026-07-01
**Deciders:** Project maintainers

## Context

Refresh tokens are long-lived credentials that, if stolen, grant ongoing API
access. Their lifecycle — how they are stored, transmitted, rotated, and revoked
— determines the blast radius of a credential leak.

## Decision

- **Access tokens:** PASETO v4.local, **1-hour TTL**, sent as an httpOnly,
  Secure, SameSite=Lax cookie. Never exposed to JavaScript.
- **Refresh tokens:** **opaque random strings**, **SHA-256-hashed at rest** in
  PostgreSQL, rotated on every use (single-use rotation). Sent as a separate
  httpOnly cookie with a path restricted to `/auth/token/refresh`.
- **Token rotation:** when a refresh token is used, the old token is
  invalidated and a new one issued. If a stolen refresh token is presented after
  the legitimate user has already used it, the system detects **token reuse**
  and revokes the entire token family — effectively logging out all sessions
  for that user.
- **Revocation:** sessions can be individually revoked via `DELETE
  /sessions/:id` or bulk-revoked via the admin panel. Revoked sessions
  immediately invalidate the associated refresh token.
- **Key rotation for PASETO:** dual-key window — deploy with both old and new
  `TOKEN_SECRET_HEX`, wait for old tokens to expire (1 hour), drop the old key.

## Alternatives considered

| Option | Why rejected |
|---|---|
| **Long-lived refresh tokens (no rotation)** | A stolen token grants indefinite access until explicit revocation. The blast radius is the full validity window. |
| **JWT refresh tokens** | JWTs carry claims in cleartext — a captured refresh token leaks user identity, scopes, and token metadata. Opaque tokens carry no information; the server resolves them from the DB. |
| **Refresh tokens in localStorage / sessionStorage** | XSS-accessible; any injected script can exfiltrate them. httpOnly cookies block JavaScript access entirely. |
| **Access token in Authorization header** | Requires JavaScript access to read and attach the token, exposing it to XSS. Cookie-based transport is automatic and inaccessible to JS. |

## Consequences

- **Positive:** Token reuse detection catches credential theft — an attacker
  who steals a refresh token can use it exactly once before the legitimate user
  notices (the stolen token is invalidated on next legitimate use).
- **Positive:** Opaque refresh tokens reveal nothing about the user or session
  if captured — they are random strings hashed at rest.
- **Positive:** Key rotation is a two-step deploy with no interruption to
  active sessions during the transition window.
- **Negative:** httpOnly cookies don't work for non-browser clients (mobile
  apps, CLI tools). The API key system (`src/api/routes/api-keys.routes.ts`)
  addresses this with SHA-256-hashed bearer tokens.
- **Negative:** Refresh-token rotation is a multi-statement write (invalidate
  old + insert new) that must be transactional. Until the repository layer (P1.1)
  wraps this, a crash between statements leaves partial state.

## References

- Token service: `src/services/token.service.ts`
- PASETO implementation: `src/crypto/paseto-v4.ts`
- API keys: `src/api/routes/api-keys.routes.ts`
- TODO: `todo.md` P1.1 (transactional token rotation)
