# Agent Instructions for zerotrust

This repository's canonical agent context is [`CLAUDE.md`](./CLAUDE.md). All coding agents (Codex, Claude Code, OpenCode, Hermes, Copilot-style agents, and future agentic tools) must read and follow it before editing code.

## Mandatory security rules

The Security hardening rules table in `CLAUDE.md` is authoritative. Re-introducing any of these patterns is a review blocker:

- **CWE-601 Open redirect:** request-supplied redirects must go through `safeRelativeRedirect()` or registered OAuth/OIDC redirect allowlists.
- **CWE-918 SSRF:** user-influenced server-side fetch hosts must go through `assertSafeFetchHost()` / `assertSafeFetchUrl()` from `src/shared/safeFetch.ts` and fetch with `redirect: "error"` plus `AbortSignal.timeout(...)`. Fixed provider URLs and operator-controlled internal sinks still need timeout + no redirects.
- **CWE-78 OS command injection:** never use `shell: true` with user data; pass literal argv arrays with `shell: false`. Only documented Windows npm shim exceptions may gate shell use on `process.platform === "win32"`.
- **CWE-22 Path traversal / unsafe upload keys:** stored filenames and object keys must be server-derived and use extensions from validated content types (`safeExtensionForContentType`, `ALLOWED_AVATAR_TYPES`), never from client filenames.
- **CWE-532 Secrets in logs/URLs:** never log raw tokens/secrets/passwords/OTP values; never put access/refresh tokens in redirect URLs or query strings (SSE uses `connectAuthenticatedSse()` with Bearer headers — see `packages/ui/src/lib/sseClient.ts`); use `Authorization` headers, httpOnly cookies, or short-lived tickets instead. OAuth: short-lived exchange codes, POST bodies, or `Authorization` headers — never provider tokens in outbound URLs.
- **CWE-1333 ReDoS / regex injection:** never interpolate unescaped user input into `new RegExp`; escape or use literal string operations.
- **CWE-327 Broken/risky crypto:** SHA-256+, AES-256-GCM, CSPRNG tokens only; SHA-1 only for HIBP protocol; static-salt backup key derivation is deprecated in favor of `BACKUP_ENCRYPTION_KEY_HEX`.
- **CWE-1427 External control of identifier:** escape/validate LDAP filters, DB identifiers, object keys, and hostnames; use Drizzle parameterized `sql`/query builder, not raw interpolation.

Before opening a PR touching auth, crypto, uploads, webhooks/fetches, filesystem, command execution, OAuth/OIDC/SAML/MFA/WebAuthn, or logging, re-scan the diff against these rules.

Structural gaps from [`docs/security.md`](./docs/security.md) are tracked in [`docs/project/todo.md`](./docs/project/todo.md) (security baseline SEC items closed; open operator security work: **SEC-ROT**; **MIG-3** closed 2026-07-16). Verified fixes: [`docs/project/shipped.md`](./docs/project/shipped.md) § Security baseline audit and Recent work (including **CRYPTO-2**, 2026-07-15). Prefer `assertCan()` / `authorizeOrg()` from `src/shared/permissions.ts` for org authz; use `hasOrgPermission()` only for the permission matrix. Next.js `middleware.ts` is not an auth boundary.

## Canonical shared modules (reuse, don't re-implement)

The "Canonical shared modules" table in `CLAUDE.md` is authoritative. Key entries every agent must know:

- **List endpoints** → `src/shared/pagination.ts` (`parsePaginatedQuery` + `paginated()`)
- **Server redirects** → `src/shared/safeRedirect.ts`
- **Server fetch** → `src/shared/safeFetch.ts`
- **Token hashing** → `src/shared/cryptoHash.ts`
- **UI API calls** → `packages/ui/src/lib/apiClient.ts`
- **UI server state (reads/writes)** → `packages/ui/src/lib/server-state/*` (TanStack Query hooks; see `docs/ui-http-client.md`)
- **Org-scoped authz** → `src/shared/permissions.ts` (`assertCan()`, `authorizeOrg()`, `hasOrgPermission()`)
- **Password hashing** → `src/shared/passwordHash.ts` (`hashPassword`, `verifyPassword`, dummy hash for timing)
- **Zod validation** → `src/middleware/zodValidation.ts` (`zValidator` wrapper on `@hono/zod-validator`)
- **Log redaction** → `src/shared/logRedaction.ts` (`redactLogEntry`, `redactLogString`)
- **Client redirects** → `packages/ui/src/lib/safeRedirect.ts`

When adding a new feature that matches one of these patterns, extend the canonical module — never inline a new implementation.

## Quality rules (performance · accessibility · best practices · SEO)

Apply only the block matching the surface you're editing. Security rules above take precedence — do not duplicate CWE guidance here. Full scoped reference (including Mobile/Expo): [`docs/agentqualityrules.md`](./docs/agentqualityrules.md).

**Scope in this repo:** Next.js UI (`packages/ui/`) and Hono API (`src/`). No Expo/mobile app — skip mobile blocks unless that surface is added.

### Web (Next.js — `packages/ui/`)

**Performance**

- Server Components by default; `'use client'` only at interactive leaves — never on a route/layout root.
- Images: `next/image` only (never raw `<img>`). Fonts: `next/font` (no Google Fonts `<link>`).
- Heavy client components: `next/dynamic` with `ssr: false` where they can't render server-side.
- No barrel-file (`index.ts` re-export) imports of large libs — they defeat tree-shaking and route splitting.
- Stream slow data via `<Suspense>`; set `revalidate` / `cache` per fetch deliberately — don't globally opt out of caching.
- Paginate server-side (reuse list hooks / `parsePaginatedQuery`); never ship large datasets to the client.
- Targets: LCP < 2.5s, INP < 200ms, CLS < 0.1. (INP replaced FID — don't reference FID.)

**Accessibility**

- Semantic HTML (`<button>` for actions, not `<div onClick>`); landmarks (`nav` / `main` / `header`).
- Every input has an associated `<label htmlFor>`; `alt` on every image (empty `alt=""` for decorative).
- Text contrast ≥ 4.5:1 (≥ 3:1 large text). Keyboard: visible focus, logical tab order; modals trap-and-restore focus.
- ARIA only when native semantics are insufficient. Form errors: `aria-describedby` + `aria-live`.
- `<html lang>` set; respect `prefers-reduced-motion`.

**Best practices**

- Zero console errors/warnings in production build. HTTPS only; CSP per [`docs/security.md`](./docs/security.md).
- `target="_blank"` carries `rel="noopener noreferrer"`. Valid HTML; error boundaries around dynamic subtrees.

**SEO** (public/marketing pages only — authenticated dashboard routes are never indexed)

- `generateMetadata` per route (unique `title` + `description`); Open Graph + Twitter cards on shareable pages.
- One `<h1>` per page; logical heading order; `app/sitemap.ts` + `app/robots.ts`; canonical URLs set.
- JSON-LD where the content type warrants it. Descriptive link text — never "click here".
- Indexable content renders SSR/SSG — never client-only. Do not add SEO scaffolding to dashboard routes.

### API (Hono — `src/`)

**Performance**

- No N+1 queries; index every column used in `where` / `join`; `select` only needed columns.
- Paginate list endpoints via `parsePaginatedQuery` + `countRows` + `paginated()` (see canonical modules).
- `Cache-Control` on cacheable GETs; stream large responses.
- Outbound fetch: timeout + abort via `safeFetch.ts` (see security rules).

**Best practices**

- Correct HTTP status codes and method semantics (GET/PUT idempotent; no side effects on GET).
- One consistent error envelope — `httpErrors.internalError` in route catch blocks; global handler in `errorHandler.ts`.
- Structured logs with request IDs. Version the API surface. Validate all inputs (zod).
