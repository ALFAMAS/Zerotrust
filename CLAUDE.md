# zerotrust — Claude Code Guide

## Project structure

Monorepo: Node/Hono API (`src/`) + Next.js 16 UI (`packages/ui/`).

| Layer        | Path                            | Port                              |
| ------------ | ------------------------------- | --------------------------------- |
| API server   | `src/api/server.ts`             | 1337                              |
| UI (Next.js) | `packages/ui/`                  | 3000                              |
| MCP server   | auto-started with UI dev server | `http://localhost:3000/_next/mcp` |

**Status docs:** [`README.md`](./README.md) summarizes what ships today; the full catalog is in
[`docs/project/shipped.md`](./docs/project/shipped.md) with open backlog in
[`docs/project/todo.md`](./docs/project/todo.md). Operators: [`docs/production-checklist.md`](./docs/production-checklist.md).
[`docs/compliance/`](./docs/compliance/README.md) covers SOC 2 policies, runbooks, and evidence.

## Running the project

```bash
bun dev          # starts API + UI concurrently
bun dev:api      # API only
bun dev:ui       # UI only (also starts MCP server)
bun run test     # vitest test suite
bun run verify:generated # regenerate SDK + API docs + drift reports and fail on diff
bun run db:backup # one-shot pg_dump backup with local + S3 retention (any S3-compatible provider)
bun run build    # tsc for API; next build for UI
```

## Shipping work

Do **not** push directly to `main`. When work is ready to ship:

2. Commit on a **feature branch**.
3. Open a **PR to `main`** (`gh pr create`).



## Next.js MCP Server for Coding Agents

When `bun dev:ui` (or `bun dev`) is running, the built-in Next.js MCP
server is available at `http://localhost:3000/_next/mcp`.

The `.mcp.json` in this repo root registers it as the `nextjs` MCP server
so Claude Code connects automatically. Available tools:

| Tool                      | What it returns                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `get_project_metadata`    | Project path and dev server URL                                                                    |
| `get_routes`              | All App Router + Pages Router routes discovered by filesystem scan                                 |
| `get_errors`              | Build errors, runtime errors, and Next.js config validation errors with source-mapped stack traces |
| `get_logs`                | Path to the dev-server log file (`packages/ui/.next/logs/next-development.log`)                    |
| `get_page_metadata`       | Runtime metadata about what contributes to the current page render (requires a browser session)    |
| `get_server_action_by_id` | Resolve a server action by its action ID                                                           |

Browser console output (`console.log`, errors, warnings) is forwarded to
the terminal via `logging.browserToTerminal: true` in
`next.config.ts` — no devtools needed.

## Key source locations

```
src/
  api/routes/       Core Hono route modules (auth, orgs, billing…)
  plugins/          Plugin loader infrastructure only (loader, registry, types)
  services/         Business logic (email, MFA, OAuth, billing…)
  middleware/       Rate limiting, CSRF, auth guards
  db/               Drizzle ORM schema + migrations
  __tests__/        Vitest tests (unit + integration)

plugins/            Feature plugins at repo root (oauth, mfa, magic-link) — see docs/plugins.md
                    Not the same as src/plugins/ (loader infrastructure only)

packages/ui/src/
  app/              Next.js App Router pages
  components/       Shared UI components
  lib/              Client-side utilities (auth tokens, API client)
  i18n/             next-intl locale config
```

## Development notes

- **Package manager**: Bun (run scripts via `bun run <script>`)
- **Database**: PostgreSQL via Drizzle ORM — `bun run db:push` to sync schema
- **Redis**: Required for sessions, rate limiting, and email queue
- **Env**: copy `.env.example` to `.env` and fill in required values
- **Web push (PWA)**: optional — set `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (generate
  with `npx web-push generate-vapid-keys`) to enable push; unset = graceful no-op.
  The service worker (`packages/ui/public/sw.js`) only registers in production builds.
- **Lint**: `bun run lint:fix` — Biome (single Rust-based tool replaces ESLint + Prettier) runs automatically on commit via husky

## Quality rules

Cross-agent performance, accessibility, best-practice, and SEO directives are in [`AGENTS.md`](./AGENTS.md) § Quality rules. Apply only the Web block when editing `packages/ui/` and the API block when editing `src/`. Do not add SEO scaffolding to authenticated dashboard routes. Mobile/Expo rules in [`docs/agentqualityrules.md`](./docs/agentqualityrules.md) apply only if that surface is added to the repo.

## MCP servers

The repository MCP servers are registered in `.mcp.json`:

- **`nextjs`** — routes, build/runtime errors, and dev-server logs (see section above).
  Auto-connects when `bun dev:ui` / `bun dev` is running.

- **`playwright`** - browser automation for local UI verification.
- **`typeui`** - remote TypeUI component and design-system tooling.

Postgres/Redis/Elasticsearch are runtime services, not MCPs. For ad-hoc DB
inspection use the `postgres` skill (read-only SQL, no config) rather than wiring
a DB MCP — this project's DB holds auth credentials and sessions.

## Recommended skills

These global skills map to the work this repo involves (invoke with `/<name>`):

| Skill                      | Use it for                                                               |
| -------------------------- | ------------------------------------------------------------------------ |
| `/security-review`         | Auth-critical changes (OAuth, MFA, WebAuthn, CSFLE, breach checks) |
| `/code-review`             | Review the current diff before opening a PR                              |
| `/test-driven-development` | New API routes/services — write the vitest first                         |
| `/test-fixing`             | Triage and fix failing vitest runs                                       |
| `/postgres`                | Read-only queries against the Drizzle/Postgres DB                        |
| `/frontend-design`         | Next.js UI work (shadcn redesign in progress)                            |
| `/webapp-testing`          | Drive/verify the UI with Playwright                                      |
| `/verify` · `/run`         | Confirm a change works in the running app, not just in tests             |
| `/changelog-generator`     | Release notes (repo uses semantic-release + conventional commits)        |


## Security hardening rules (mandatory for all agents)

These rules close the CWE classes found in the 2026-06-26 audit. Every agent
working in this repo (Claude Code, Codex, OpenCode, Hermes) MUST follow them.
Re-introducing any of these patterns is a review blocker.

| CWE | Rule | Canonical fix |
| --- | --- | --- |
| **CWE-601** Open redirect | Never use a request-supplied URL as a redirect target. Sanitize with `safeRelativeRedirect()` from `src/shared/safeRedirect.ts` — only same-origin relative paths (`/...`, no `//`, no `/\`, no control chars). For OAuth clients use `isRegisteredRedirectUri()` allowlist. | `src/shared/safeRedirect.ts` |
| **CWE-918** SSRF | Any server-side `fetch`/HTTP whose host comes from user input (webhook URL, notification/webhook URL, remote metadata URL, image proxy, SSF receiver, etc.) must reject IP literals, private/loopback/link-local/metadata hosts, non-default ports, and fetch with `redirect: "error"` plus `AbortSignal.timeout(...)`. Fixed SaaS/provider URLs and operator-controlled internal URLs do not need the public-host guard, but still need timeout + no redirects. | `assertSafeFetchHost` / `assertSafeFetchUrl` in `src/shared/safeFetch.ts` (used by `src/notifications/dispatcher.ts`, `src/mfa/fido-mds3.ts`, `src/webhooks/delivery.ts`, `src/ssf/sender.ts`) |
| **CWE-78** OS command injection | Never `spawn(cmd, args, { shell: true })`. Always pass args as a literal argv with `shell: false`. Never interpolate user input into a command string. If a Windows `.cmd` shim is unavoidable, gate `shell:true` on the command literally ending in `.cmd` (or on `process.platform === "win32"` for npm). | `run()` in `src/services/dbBackup.service.ts`, `scripts/db-backup.js`, `scripts/db-restore.js`, `scripts/postinstall.js` |
| **CWE-22** Path traversal | Filenames/object keys written to disk or S3 must be server-derived (uuid/random + timestamp + validated extension). Never use the client filename directly, even just for the extension. Validate extensions against an allowlist map (`safeExtensionForContentType`, `ALLOWED_AVATAR_TYPES`). | `src/services/uploadSafety.ts`, `src/services/presignedUpload.service.ts`, `src/api/routes/admin.routes.ts`, `auth.routes.ts` avatar upload |
| **CWE-532** Secrets in logs | Log only identifiers (userId, providerId, scope, client_id). Never log raw token/secret/password values. Do not put access/refresh tokens in redirect URLs or query strings (SSE/EventSource, `?token=`) — use `Authorization` headers, httpOnly cookies, or short-lived ticket endpoints. OAuth: use the short-lived exchange-code pattern (see `POST /oauth/exchange`). Do not put OAuth provider access tokens/client secrets in outbound request URLs; use POST bodies or `Authorization` headers. | OAuth exchange flow in `plugins/oauth/routes.ts`; magic-link GET verify in `plugins/magic-link/routes.ts`; Facebook provider in `plugins/oauth/providers/facebook.ts`; notification SSE via `connectAuthenticatedSse()` + Bearer (`packages/ui/src/lib/sseClient.ts`, `NotificationBell.tsx`) |
| **CWE-1333** ReDoS / regex injection | Never `new RegExp(\`...${interpolated}...\`)` with unescaped interpolation. Escape metacharacters (`escapeRegExp`) or use `String.split().join()` for literal substitution. Avoid nested quantifiers `(a+)+` in patterns run on attacker input; cap input length for regex parsers over untrusted data. | `escapeRegExp` in `src/db/storageFallback.ts` |
| **CWE-327** Broken/risky crypto | Use SHA-256+ for hashes, AES-256-GCM for encryption, `crypto.randomBytes`/`randomUUID` for tokens. SHA-1 is only permitted for the HIBP k-anonymity breach check (`passwordBreach.service.ts`). Use `scryptSync`/`argon2` with a per-key random salt, never a hardcoded salt. The static-salt `scryptSync(raw, "zerotrust-db-backup", 32)` fallback in backup scripts is deprecated — use `BACKUP_ENCRYPTION_KEY_HEX` (32 raw bytes). | `src/services/dbBackup.service.ts`, `scripts/db-backup.js`, `scripts/db-restore.js` |
| **CWE-1427** External control of identifier | When user input selects a system identifier (DB table/column, object key, hostname), it must be escaped/validated before use. DB identifiers go through Drizzle's parameterized `sql` tag, never string interpolation; object keys are server-derived and extension-validated. | `safeExtensionForContentType` in `src/services/uploadSafety.ts` |
| **CWE-79** Stored/reflected XSS | Don't hand-roll per-field HTML escaping. Request strings (JSON body, query, path, form) are sanitized globally by `inputSanitizationMiddleware()` (dangerous tags stripped, event handlers/`javascript:` neutralized, remaining angle brackets entity-encoded). Sensitive fields and signed/SSF payloads are skipped. Build regexes from constants or escaped input (never from raw user input) and keep the sensitive-field/excluded-path lists current. | `src/middleware/inputSanitization.ts` (mounted in `src/api/server.ts`) |

**Before opening a PR on auth- or crypto-touching code**, re-scan the diff
against this table. Add a `/security-review` pass for changes to OAuth,
MFA, WebAuthn, CSFLE, breach checks, or any new `fetch`/`spawn`/`fs.writeFile`.

### Security baseline (`docs/security.md`)

Structural gaps beyond the CWE table above are tracked in
[`docs/project/todo.md`](./docs/project/todo.md) (security baseline SEC items closed; open operator
security work **SEC-ROT** and **MIG-3**) with verified fixes in
[`docs/project/shipped.md`](./docs/project/shipped.md) § Security baseline audit and Recent work
(including **CRYPTO-2**, 2026-07-15). When touching authz, sessions, or tenant isolation:
prefer `assertCan()` / `authorizeOrg()` from `src/shared/permissions.ts` and
org-scoped repositories; do not add inline `user.roles?.includes` checks. Passwords
use `src/shared/passwordHash.ts` (`Bun.password` argon2id with bcrypt verify/rehash
fallback). Next.js `middleware.ts` must not become an auth boundary.

## Canonical shared modules (extend, don't duplicate)

Every agent working in this repo MUST reuse these modules instead of re-implementing the pattern:

| Module | Exports | Use it for |
| --- | --- | --- |
| `src/shared/pagination.ts` | `parsePaginatedQuery(query, opts?)`, `paginated(data, {page,limit,total})` | Any list endpoint returning DB rows. Enforces bounded page/limit, returns `{ data, pagination: { page, limit, total, totalPages, hasNext, hasPrev } }`. Default limit 20, default max 200. |
| `src/shared/dbCount.ts` | `countRows(db, table, where?)` | `COUNT(*)` for list endpoints — pairs with `paginated()` inside a `Promise.all`. Never inline `select({ count: sql\`count(*)::int\` })`. |
| `src/shared/httpErrors.ts` | `internalError(c, logger, logLabel, err, clientMessage?)` | **The** helper for explicit route `catch` blocks: logs the error, returns the canonical `{ error: "INTERNAL_ERROR" }` 500 (CWE-532 — never serialize the raw error). Used in ~115 handlers. |
| `src/shared/roles.ts` | `hasRole(user, role)`, `hasAnyRole(user, roles)`, `isAdmin(user)` | System-level role checks on the principal's `roles` array. Null-safe / fail-closed; never inline `user.roles?.includes(...)`. |
| `src/shared/permissions.ts` | `assertCan()`, `authorizeOrg()`, `hasOrgPermission()` | Org-scoped authorization — reuse instead of inline permission logic. |
| `src/shared/passwordHash.ts` | `hashPassword()`, `verifyPassword()`, `dummyPasswordHash()` | Password hashing (argon2id + bcrypt fallback/rehash) — never inline `Bun.password` or bcrypt. |
| `src/middleware/zodValidation.ts` | `zValidator()` | Canonical `@hono/zod-validator` wrapper — use parsed output, whitelist update schemas. |
| `src/shared/logRedaction.ts` | `redactLogEntry()`, `redactLogString()` | Structured log + error redaction (CWE-532) — used by `getLogger()` and audit pipelines. |
| `src/middleware/csrfOrigin.ts` | `csrfOriginMiddleware()` | Cookie-session CSRF origin check — mounted globally; Bearer/API-key/webhook paths exempt. |
| `src/middleware/bodySizeLimit.ts` | `bodySizeLimitMiddleware()` | Global body-size cap (1 MiB JSON/text, 10 MiB multipart). |
| `src/shared/safeRedirect.ts` | `safeRelativeRedirect()`, `appRedirectUrl()`, `isRegisteredRedirectUri()` | All server-side redirects (CWE-601). |
| `src/shared/safeFetch.ts` | `assertSafeFetchHost()`, `assertSafeFetchUrl()`, `fetchPublicUrl()`, `fetchFixedUrl()` | Any server-side HTTP to non-fixed hosts (CWE-918). |
| `src/shared/cryptoHash.ts` | `hashTokenSha256()`, `hashTokensSha256()`, `hashFingerprint()`, `hashBase64Url()` | Hashing tokens/fingerprints — never inline `createHash()`. |
| `src/middleware/auth.ts` | `authMiddleware`, `requireAdmin`, `optionalAuthMiddleware` | Auth guards. Reuse `requireAdmin` — do not re-implement the admin check inline in a router. |
| `src/middleware/inputSanitization.ts` | `inputSanitizationMiddleware()`, `sanitizeInputString()` | Global XSS sanitization of request bodies/query/params (CWE-79). Mounted once in `server.ts`; sensitive fields and signed/SSF payloads are skipped. |
| `packages/ui/src/lib/apiClient.ts` | `apiGet()`, `apiPost()`, `apiPatch()`, `apiPut()`, `apiPostFormData()`, `apiGetBlob()`, `apiDelete()` | Canonical UI→API boundary for new code — never raw `fetch()`. The old `packages/ui/src/lib/api.ts` facade has been removed; use `apiClient` or `server-state` hooks directly. |
| `packages/ui/src/lib/safeRedirect.ts` | `clientSafeRedirect()` | Client-side redirects in React/Next.js |
| `src/shared/apiHelpers.ts` | `routeHandler()`, `ok()`, `fail()`, `HttpError`, `dbGuard()` | Wrapper-style scaffolding for **new** routes: `routeHandler()` removes the try/catch; `dbGuard()` guards Drizzle queries against not-yet-migrated tables. (Its `internalError(c, err, label)` is the wrapper's internal convenience — for explicit catch blocks use `httpErrors.internalError`.) |
| `src/api/errorHandler.ts` | `registerGlobalErrorHandler()`, `internalErrorResponse()` | Global Hono error handler with request IDs and CWE-532 safe redaction. |
| `packages/ui/src/lib/server-state/` | Domain modules (`auth.ts`, `organizations.ts`, …), `queryKeys.ts`, `prefetch.ts`, `types.ts` | TanStack Query layer: `queryOptions`, `useQuery`/`useMutation` hooks, cache invalidation. Pages import domain hooks — not `apiClient` directly (except one-off utilities). `QueryProvider` in root layout. |
| `packages/ui/src/components/QueryProvider.tsx` | `QueryProvider` | App-level `QueryClientProvider` with shared stale/retry defaults. |
| `packages/ui/src/components/ui/States.tsx` | `LoadingSpinner`, `EmptyState`, `ErrorState`, `SkeletonList` | Shared UI states — replaces repeated loading/error/empty JSX patterns. |
| `src/db/repositories/` | `claimStripeEvent()`/`releaseStripeEvent()` (stripeEvents) — growing | **Repository layer for hot-path writes.** New multi-statement / idempotent / append-only mutations (refresh-token rotation, session lifecycle, billing, wallet ledger, org role transitions, support tickets, passkeys) go behind a repository method that owns the transaction and invariants, instead of inline Drizzle in a route/service. |

When adding a new list endpoint: use `parsePaginatedQuery` + `countRows` + `paginated()` (or `routeHandler()` to drop the try/catch). In a route `catch` block, use `httpErrors.internalError`. For an admin-only router, mount `requireAdmin`. For a role check, use `roles.ts`. When adding a new crypto hash: use `cryptoHash.ts`. When adding a redirect: use `safeRedirect.ts`. When adding a server fetch: use `safeFetch.ts`. When adding a DB query that may hit a not-yet-migrated table: use `dbGuard()`. When adding a hot-path / multi-statement / append-only write, or any external-event consumer (webhook, queue), put it behind a `src/db/repositories/` method that owns the transaction and records an idempotency key so retries/replays are no-ops (see `stripeEvents.repository.ts`). For frontend data fetching, add/extend a `packages/ui/src/lib/server-state/<domain>.ts` module with query keys, `queryOptions`, hooks, and mutations — pages import those hooks, not `apiClient` directly. Extracting/replacing inline implementations with these modules is always preferred.
