# ADR 008: Token Storage Design — Hybrid Browser + Native Clients

**Status:** Accepted — **Option C shipped** (2026-07-04)
**Date:** 2026-07-03 (updated 2026-07-05)
**Deciders:** Project maintainers
**Supersedes/Amends:** ADR 006 (Token Storage and Rotation Strategy) — clarifies
browser and native client token delivery on top of the shared session model.

## Context

ADR 006 describes refresh tokens as opaque, SHA-256-hashed, single-use rotated
credentials and access tokens as short-lived PASETO v4.local tokens. The open
question was how those tokens reach **browser** vs **native** clients when the
Next.js UI (`:3000`) and Hono API (`:1337`) are separate origins.

The previous default template stored both tokens in `localStorage`, which left
refresh tokens readable by any XSS payload.

## Decision

Ship **Option C — hybrid in-memory access token + httpOnly refresh cookie** for
the browser UI. Do **not** add a Backend-for-Frontend (BFF) proxy layer.

### Browser (Next.js UI)

1. **Access token:** held in JS memory only (`packages/ui/src/lib/auth.ts`); never
   written to `localStorage`. Lost on full page reload.
2. **RSC prefetch mirror (accepted tradeoff — SEC-20):** when the client receives a
   new access token, `setToken()` also writes a short-lived, JS-readable first-party
   cookie `za_access_token` so Next.js Server Components can authenticate
   `serverApiClient.ts` prefetch reads. This is **not** httpOnly — XSS can read it
   during an active session, same as in-memory access. We accept this tradeoff
   instead of a BFF proxy layer.
   - **Cookie:** `za_access_token`; `path=/`; `SameSite=Lax`; **not** `HttpOnly`
     (set via `document.cookie` — browsers cannot set httpOnly from JS).
   - **TTL:** `max-age=3600` (1 h), aligned with PASETO access-token TTL.
   - **Scope:** UI origin only; cleared on `clearToken()` / logout.
   - **Consumer:** `packages/ui/src/lib/serverApiClient.ts` reads via `cookies()`.
   - **Mitigations:** refresh token remains httpOnly; access token is short-lived;
     CSP + global input sanitization; no refresh token in this cookie; mirror is
     cleared on logout; full page reload still requires silent refresh (memory lost).
   - **Future:** migrate to httpOnly session ticket or BFF if threat model tightens.
3. **Refresh token:** set by the API as an `httpOnly`, `Secure`, `SameSite=Lax`
   cookie (`src/shared/authCookies.ts`) on login, OAuth exchange, and refresh.
   Response bodies omit `refreshToken` for browser login paths.
4. **Bootstrap:** on app load, `bootstrapAccessToken()` calls `POST /auth/token/refresh`
   with `credentials: "include"`; `apiClient.ts` replays 401s the same way.
5. **Logout:** `POST /auth/logout` clears the refresh cookie server-side;
   `clearToken()` clears in-memory access token and the `za_access_token` mirror.

**Mitigations:** refresh token not readable by JS; access token not persisted;
CSP + input sanitization; 1h access TTL; single-use refresh rotation with family
revocation on reuse detection.

### Native clients (React Native, CLI)

Call the Hono API directly. Store access and refresh tokens in device secure
storage (Keychain / Keystore). Send `Authorization: Bearer` on each request;
refresh via `POST /auth/token/refresh` with the refresh token in the JSON body
(`readRefreshTokenFromRequest` accepts cookie or body). Use API keys only for
non-interactive machine integrations — not as end-user mobile login.

## Consequences

- **Browser:** XSS can no longer exfiltrate a persisted refresh token. Active-session
  access tokens remain in memory and in the short-lived `za_access_token` mirror
  cookie (stealable until tab close / logout). Full page reload requires one silent
  refresh round-trip.
- **CORS/credentials:** UI `fetch` uses `credentials: "include"`; API CORS must
  allow the UI origin with credentials (`CORS_ALLOWED_ORIGINS`).
- **No BFF:** simpler deploy surface; web and native share one API and session
  model without a Next.js auth proxy.
- **Native token response:** password/OAuth login paths may need an explicit native
  client header so refresh tokens are returned in JSON for mobile — see auth routes.

## References

- ADR 006: Token Storage and Rotation Strategy
- ADR 001: PASETO v4 for Access Tokens
- Token client: `packages/ui/src/lib/auth.ts`
- RSC prefetch client: `packages/ui/src/lib/serverApiClient.ts`
- HTTP client: `packages/ui/src/lib/apiClient.ts`
- Cookie helpers: `src/shared/authCookies.ts`
- Auth routes: `src/api/routes/auth.routes.ts`
- API keys (machine integrations): `src/api/routes/api-keys.routes.ts`
