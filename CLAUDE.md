# zerotrust — Claude Code Guide

## Project structure

Monorepo: Node/Hono API (`src/`) + Next.js 16 UI (`packages/ui/`).

| Layer        | Path                            | Port                              |
| ------------ | ------------------------------- | --------------------------------- |
| API server   | `src/api/server.ts`             | 1337                              |
| UI (Next.js) | `packages/ui/`                  | 3000                              |
| MCP server   | auto-started with UI dev server | `http://localhost:3000/_next/mcp` |

**Status docs:** [`README.md`](./README.md) is the source of truth for what ships
today (see its **Features** section); [`docs/compliance/`](./docs/compliance/README.md)
covers SOC 2 policies, runbooks, and evidence.

## Running the project

```bash
bun dev          # starts API + UI concurrently
bun dev:api      # API only
bun dev:ui       # UI only (also starts MCP server)
bun run test     # vitest test suite (236 tests)
bun run db:backup # one-shot pg_dump backup with local + S3 retention (any S3-compatible provider)
bun run build    # tsc for API; next build for UI
```

## Shipping work

Do **not** push directly to `main`. When work is ready to ship:

1. Refresh the knowledge graph: `/graphify . --update` (incremental — `graphify-out/`
   already has an AST cache; use full `/graphify .` only if the graph is missing).
2. Commit on a **feature branch**.
3. Open a **PR to `main`** (`gh pr create`).

graphify's full pipeline needs an agent to run it (it dispatches extraction
subagents), so it can't be wired into a git/CI hook — run it as the first step
of shipping, not on push.

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
  api/routes/       18 Hono route modules (auth, users, orgs, billing…)
  services/         Business logic (email, MFA, OAuth, billing…)
  middleware/       Rate limiting, CSRF, auth guards
  db/               Drizzle ORM schema + migrations
  __tests__/        Vitest tests (unit + integration)

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

## MCP servers

Only one MCP is needed for this repo, already registered in `.mcp.json`:

- **`nextjs`** — routes, build/runtime errors, and dev-server logs (see section above).
  Auto-connects when `bun dev:ui` / `bun dev` is running.

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
| `/graphify`                | Refresh the knowledge graph (`graphify-out/`) — first step of shipping   |

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
| **CWE-532** Secrets in logs | Log only identifiers (userId, providerId, scope, client_id). Never log raw token/secret/password values. Do not put access/refresh tokens in redirect URLs — use the short-lived exchange-code pattern (see `POST /oauth/exchange`). Do not put OAuth provider access tokens/client secrets in outbound request URLs; use POST bodies or `Authorization` headers. | OAuth exchange flow in `auth.routes.ts`; magic-link GET verify in `magic-link.routes.ts`; Facebook provider in `src/oauth/providers/facebook.ts` |
| **CWE-1333** ReDoS / regex injection | Never `new RegExp(\`...${interpolated}...\`)` with unescaped interpolation. Escape metacharacters (`escapeRegExp`) or use `String.split().join()` for literal substitution. Avoid nested quantifiers `(a+)+` in patterns run on attacker input; cap input length for regex parsers over untrusted data. | `escapeRegExp` in `src/db/storageFallback.ts` |
| **CWE-327** Broken/risky crypto | Use SHA-256+ for hashes, AES-256-GCM for encryption, `crypto.randomBytes`/`randomUUID` for tokens. SHA-1 is only permitted for the HIBP k-anonymity breach check (`passwordBreach.service.ts`). Use `scryptSync`/`argon2` with a per-key random salt, never a hardcoded salt. The static-salt `scryptSync(raw, "zerotrust-db-backup", 32)` fallback in backup scripts is deprecated — use `BACKUP_ENCRYPTION_KEY_HEX` (32 raw bytes). | `src/services/dbBackup.service.ts`, `scripts/db-backup.js`, `scripts/db-restore.js` |
| **CWE-1427** External control of identifier | When user input selects a system identifier (DB table/column, object key, hostname), it must be escaped/validated before use. DB identifiers go through Drizzle's parameterized `sql` tag, never string interpolation; object keys are server-derived and extension-validated. | `safeExtensionForContentType` in `src/services/uploadSafety.ts` |

**Before opening a PR on auth- or crypto-touching code**, re-scan the diff
against this table. Add a `/security-review` pass for changes to OAuth,
MFA, WebAuthn, CSFLE, breach checks, or any new `fetch`/`spawn`/`fs.writeFile`.

## Canonical shared modules (extend, don't duplicate)

Every agent working in this repo MUST reuse these modules instead of re-implementing the pattern:

| Module | Exports | Use it for |
| --- | --- | --- |
| `src/shared/pagination.ts` | `parsePaginatedQuery(query, opts?)`, `paginated(data, {page,limit,total})` | Any list endpoint returning DB rows. Enforces bounded page/limit, returns `{ data, pagination: { page, limit, total, totalPages, hasNext, hasPrev } }`. Default limit 20, default max 200. |
| `src/shared/safeRedirect.ts` | `safeRelativeRedirect()`, `appRedirectUrl()`, `isRegisteredRedirectUri()` | All server-side redirects (CWE-601). |
| `src/shared/safeFetch.ts` | `assertSafeFetchHost()`, `assertSafeFetchUrl()`, `fetchPublicUrl()`, `fetchFixedUrl()` | Any server-side HTTP to non-fixed hosts (CWE-918). |
| `src/shared/cryptoHash.ts` | `hashTokenSha256()`, `hashTokensSha256()`, `hashFingerprint()`, `hashBase64Url()` | Hashing tokens/fingerprints — never inline `createHash()`. |
| `packages/ui/src/lib/apiClient.ts` | `apiGet()`, `apiPost()`, `apiPostFormData()`, `apiGetBlob()`, `apiDelete()` | All UI→API calls — never raw `fetch()`. |
| `packages/ui/src/lib/safeRedirect.ts` | `clientSafeRedirect()` | Client-side redirects in React/Next.js |
| `src/shared/apiHelpers.ts` | `routeHandler()`, `ok()`, `fail()`, `internalError()`, `HttpError`, `dbGuard()` | Wrap route handlers with auto error handling; standardize responses; guard Drizzle queries against missing tables. |
| `src/api/errorHandler.ts` | `registerGlobalErrorHandler()`, `internalErrorResponse()` | Global Hono error handler with request IDs and CWE-532 safe redaction. |
| `packages/ui/src/lib/hooks/useApi.ts` | `useApi(path, opts)`, `usePaginatedApi(path, opts)` | Data-fetch hooks that replace useEffect+api.get+loading+error boilerplate. |
| `packages/ui/src/components/ui/States.tsx` | `LoadingSpinner`, `EmptyState`, `ErrorState`, `SkeletonList` | Shared UI states — replaces repeated loading/error/empty JSX patterns. |

When adding a new list endpoint: use `routeHandler()` + `parsePaginatedQuery` + `paginated()`. When adding a new crypto hash: use `cryptoHash.ts`. When adding a redirect: use `safeRedirect.ts`. When adding a server fetch: use `safeFetch.ts`. When adding a DB query: use `dbGuard()` if it touches tables that might not exist yet. Use `useApi`/`usePaginatedApi` for frontend data fetching. Extracting/replacing inline implementations with these modules is always preferred.

