# ADR 008: Token Storage Design — SPA localStorage vs BFF/httpOnly Cookies

**Status:** Accepted (design decision for fork consumers)
**Date:** 2026-07-03
**Deciders:** Project maintainers
**Supersedes/Amends:** ADR 006 (Token Storage and Rotation Strategy) — clarifies
the gap between ADR 006's aspirational httpOnly cookie design and the actual
SPA `localStorage` implementation.

## Context

ADR 006 describes the ideal token-storage design: access tokens in httpOnly
Secure SameSite cookies, refresh tokens in httpOnly cookies scoped to
`/auth/token/refresh`, and neither token ever exposed to JavaScript. This
minimizes the blast radius of XSS — an injected script cannot exfiltrate what it
cannot read.

The **actual implementation** in the default zerotrust template takes a
different approach: both tokens live in `localStorage` via
`packages/ui/src/lib/auth.ts`:

```typescript
const ACCESS_TOKEN_KEY = "za_access_token";
const REFRESH_TOKEN_KEY = "za_refresh_token";
// getToken() → localStorage.getItem(ACCESS_TOKEN_KEY)
// setToken() → localStorage.setItem(...)
```

This is a deliberate architecture choice for a cross-origin SPA: the Next.js UI
(`:3000`) and the Hono API (`:1337`) are separate origins in development and may
be separate origins in production. httpOnly cookies require same-origin (or
careful `SameSite`/CORS/credentials configuration), which would break the
provider-agnostic, API-first deployment model.

**Risk:** any XSS payload can read both tokens from `localStorage` and
exfiltrate them. The access token (1h TTL) limits the window, and refresh-token
rotation + reuse detection (ADR 006) limits replay, but a determined attacker
who exfiltrates the refresh token can race the rotation.

## Decision

The default template ships with **`localStorage` token storage** (the SPA
pattern). This is documented as a conscious tradeoff, not a bug. Forks that
require stronger XSS resistance should adopt the **BFF (Backend-for-Frontend)
/ httpOnly cookie** pattern described below.

### Option A — Current SPA + localStorage (default template)

- **Pros:** simple, works cross-origin, no cookie/CORS complexity, tokens are
  API-ready for SDK/mobile consumers that share the same client.
- **Cons:** XSS-accessible. An injected script can read and exfiltrate both
  tokens.
- **Mitigations already in place:** 1h access-token TTL, single-use refresh
  rotation with family revocation on reuse detection, CSP headers, input
  sanitization middleware.

### Option B — BFF / httpOnly cookies (fork hardening)

Move token storage server-side by introducing a thin BFF layer — either as a
Next.js route handler (`app/api/auth/...`) or a dedicated reverse proxy — that:

1. Receives login/refresh responses from the API.
2. Strips tokens from the response body.
3. Sets them as httpOnly, Secure, SameSite=Lax cookies.
4. Forwards subsequent browser requests to the API, attaching the cookie-derived
   `Authorization: Bearer` header server-side.

**Migration steps for forks:**

1. Create `packages/ui/src/app/api/auth/[...path]/route.ts` — a catch-all
   proxy that forwards auth requests to the API and converts token responses
   to `Set-Cookie` headers.
2. Replace `packages/ui/src/lib/auth.ts` `getToken()`/`setToken()` with
   server-side cookie reads (Next.js `cookies()` API in Server Components /
   route handlers).
3. Update `packages/ui/src/lib/apiClient.ts` to read the token from cookies
   (server-side) or from a `/api/auth/token` endpoint that returns only the
   access token to the client (no refresh token ever reaches JS).
4. Scope the refresh-token cookie to `/api/auth/token/refresh` only.
5. Set `SameSite=Lax` (or `Strict` if the UI and API are same-site).
6. Remove `localStorage` usage entirely — grep for `za_access_token` /
   `za_refresh_token` to confirm zero references remain.

### Option C — Hybrid (in-memory access token + httpOnly refresh)

Store the access token in JS memory only (not persisted), and the refresh token
in an httpOnly cookie. On page reload, a silent `/auth/token/refresh` call
re-populates the in-memory access token. This limits XSS exfiltration to the
active session (no persisted token to steal) but adds a network round-trip on
every page load.

## Consequences

- **Default template:** XSS can access tokens. This is accepted for the
  cross-origin SPA tradeoff. CSP, input sanitization, and short TTLs are the
  primary defenses.
- **Forks adopting Option B/C:** XSS resistance improves significantly — an
  injected script cannot read httpOnly cookies. The cost is added infrastructure
  (BFF proxy) and the loss of direct API access from the browser (SDK consumers
  must use API keys instead of user tokens).
- **No change required for the default template.** This ADR documents the
  tradeoff so fork consumers can make an informed decision.

## References

- ADR 006: Token Storage and Rotation Strategy (aspirational httpOnly design)
- ADR 001: PASETO v4 for Access Tokens
- Token client: `packages/ui/src/lib/auth.ts`
- HTTP client: `packages/ui/src/lib/apiClient.ts`
- Token service: `src/services/token.service.ts`
- API keys (non-browser alternative): `src/api/routes/api-keys.routes.ts`
