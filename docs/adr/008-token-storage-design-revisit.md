# ADR 008: Token Storage Design — SPA localStorage vs BFF/httpOnly Cookies

**Status:** Accepted — **Option C shipped** in default template (2026-07-04)
**Date:** 2026-07-03 (updated 2026-07-04)
**Deciders:** Project maintainers
**Supersedes/Amends:** ADR 006 (Token Storage and Rotation Strategy) — clarifies
the gap between ADR 006's aspirational httpOnly cookie design and the actual
SPA implementation.

## Context

ADR 006 describes the ideal token-storage design: access tokens in httpOnly
Secure SameSite cookies, refresh tokens in httpOnly cookies scoped to
`/auth/token/refresh`, and neither token ever exposed to JavaScript. This
minimizes the blast radius of XSS — an injected script cannot exfiltrate what it
cannot read.

The **previous default template** stored both tokens in `localStorage` via
`packages/ui/src/lib/auth.ts`. That was a deliberate cross-origin SPA tradeoff
(Next.js UI on `:3000`, Hono API on `:1337`) but left refresh tokens readable by
any XSS payload.

**Risk:** any XSS payload could read both tokens from `localStorage` and
exfiltrate them. CSP (ZT-2) and input sanitization reduce likelihood; short TTLs
and refresh rotation limit replay — but persisted refresh tokens remained the
weakest link.

## Decision

The default template now ships **Option C — hybrid in-memory access token +
httpOnly refresh cookie** (ZT-3, 2026-07-04).

### Option C — Shipped default (in-memory access + httpOnly refresh)

1. **Access token:** held in JS memory only (`packages/ui/src/lib/auth.ts`); never
   written to `localStorage`. Lost on full page reload.
2. **Refresh token:** set by the API as an `httpOnly`, `Secure`, `SameSite=Lax`
   cookie (`src/shared/authCookies.ts`) on login, OAuth exchange, and refresh.
   Response bodies no longer include `refreshToken`.
3. **Bootstrap:** on app load, `bootstrapAccessToken()` calls `POST /auth/token/refresh`
   with `credentials: "include"`; `apiClient.ts` replays 401s the same way.
4. **Logout:** `POST /auth/logout` clears the refresh cookie server-side;
   `clearToken()` clears in-memory access token.

**Mitigations:** refresh token not readable by JS; access token not persisted;
CSP + input sanitization; 1h access TTL; single-use refresh rotation with family
revocation on reuse detection.

### Option A — SPA + localStorage (deprecated default)

Removed from the default template. Forks may revert to this pattern for pure
cross-origin SDK/mobile consumers that cannot use cookies — document the XSS
tradeoff explicitly.

### Option B — Full BFF / httpOnly cookies (fork hardening)

Move token storage server-side by introducing a thin BFF layer — either as a
Next.js route handler (`app/api/auth/...`) or a dedicated reverse proxy — that:

1. Receives login/refresh responses from the API.
2. Strips tokens from the response body.
3. Sets them as httpOnly, Secure, SameSite=Lax cookies.
4. Forwards subsequent browser requests to the API, attaching the cookie-derived
   `Authorization: Bearer` header server-side.

See `docs/extending.md` §BFF migration checklist for fork steps. Option B remains
the strongest XSS posture when UI and API share a site and a BFF is acceptable.

## Consequences

- **Default template:** XSS can no longer exfiltrate a persisted refresh token.
  Active-session access tokens remain in memory (stealable until tab close).
  Full page reload requires one silent refresh round-trip.
- **CORS/credentials:** UI `fetch` uses `credentials: "include"`; API CORS must
  allow the UI origin with credentials (`CORS_ALLOWED_ORIGINS`).
- **SDK/mobile:** non-browser consumers continue to use API keys or explicit
  bearer tokens from login responses on routes that still return them for
  machine clients — browser login paths omit refresh tokens from JSON bodies.
- **Forks adopting Option B:** strongest XSS resistance; adds BFF infrastructure.

## References

- ADR 006: Token Storage and Rotation Strategy
- ADR 001: PASETO v4 for Access Tokens
- Token client: `packages/ui/src/lib/auth.ts`
- HTTP client: `packages/ui/src/lib/apiClient.ts`
- Cookie helpers: `src/shared/authCookies.ts`
- Auth routes: `src/api/routes/auth.routes.ts`
- API keys (non-browser alternative): `src/api/routes/api-keys.routes.ts`
