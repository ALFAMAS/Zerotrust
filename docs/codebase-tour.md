# Codebase tour — start here

New to the repo? This page is the map. It tells you what lives where, how a
request flows through the system, and where to add things. Deeper dives are
linked at the end.

## The 10,000-foot view

zerotrust is a **Bun monorepo** with two deployable apps and a shared toolbox:

```
zerotrust/
├── src/            ← the API server (Hono, port 1337) — most backend work happens here
├── packages/
│   ├── ui/         ← the web app (Next.js, port 3000): landing, dashboard, admin
│   └── client/     ← generated TypeScript SDK (never edit by hand — `bun run sdk:generate`)
├── plugins/        ← optional auth features loaded at boot: oauth, mfa, magic-link
├── drizzle/        ← SQL migrations (generated; applied with `bun run db:migrate`)
├── scripts/        ← operational scripts: bootstrap-admin, db-backup, CI gates
├── docs/           ← architecture, deployment, compliance, project status
└── tests/          ← load/chaos tests (k6); unit tests live next to the code instead
```

Run everything with `bun dev` (see the [README quick start](../README.md#quick-start)).

## Inside `src/` — the API server

Two kinds of directories live here: **layers** (the request pipeline every
feature uses) and **feature subsystems** (one directory per product area).

### The layers — how a request flows

```
HTTP request
   │
   ▼
src/api/server.ts        ← app entry: mounts every route module (start reading here)
   │
   ▼
src/middleware/          ← auth guard, rate limiting, CSRF, input sanitization…
   │
   ▼
src/api/routes/          ← one file per resource: parse input, call services, shape response
   │
   ▼
src/services/            ← business logic (email, billing, sessions, search…)
   │
   ▼
src/db/                  ← Drizzle schema, repositories (transactional writes), migrations glue
```

Cross-cutting helpers used by all layers:

| Directory       | What it is                                                                  |
| --------------- | --------------------------------------------------------------------------- |
| `src/shared/`   | The canonical toolbox: pagination, permissions, safeRedirect, safeFetch, password hashing. **Always check here before writing a helper** — reuse is mandatory (see [`CLAUDE.md`](../CLAUDE.md) § Canonical shared modules). |
| `src/config/`   | Environment parsing + validation; the app refuses to boot in production without required secrets. |
| `src/logger/`   | Structured logging with secret redaction.                                   |
| `src/types/`    | Shared TypeScript types.                                                    |

### The feature subsystems — one directory per product area

Every feature area sits flat at `src/<feature>/` with its own routes/logic:

| Directory            | Feature                                                        |
| -------------------- | -------------------------------------------------------------- |
| `src/audit/`         | Tamper-evident (hash-chained) audit log                        |
| `src/crypto/`        | CSFLE field encryption, key stores, one-time codes             |
| `src/jit/`           | Cross-tenant just-in-time access requests                      |
| `src/jobs/`          | Scheduled jobs (retention, billing lifecycle, backups)         |
| `src/metrics/`       | Prometheus metrics                                             |
| `src/mfa/`           | MFA channels + WebAuthn attestation policy                     |
| `src/notifications/` | Notification dispatch + SSE                                    |
| `src/scim/`          | SCIM 2.0 provisioning                                          |
| `src/ssf/`           | Shared Signals Framework (security event exchange)             |
| `src/telemetry/`     | OpenTelemetry tracing                                          |
| `src/templates/`     | Email templates                                                |
| `src/webhooks/`      | User-defined webhooks: store, delivery, signing, replay safety |

Which feature may import which is enforced by [`.boundaries.json`](../.boundaries.json)
(`bun run boundaries:check`) — domains layer from `shared` up to `ops`.

Entry points: `src/api/server.ts` (API), `src/worker.ts` (background queue
worker — run exactly one in production), `src/index.ts` (library exports).

### `plugins/` vs `src/plugins/` — the one naming trap

- **`plugins/`** (repo root) = actual features: `oauth/`, `mfa/`, `magic-link/`.
  Each has a manifest and mounts its own routes. See [`docs/plugins.md`](./plugins.md).
- **`src/plugins/`** = the tiny loader that discovers and mounts those plugins at boot.

## Inside `packages/ui/` — the web app

```
packages/ui/src/
├── app/                ← Next.js App Router pages (one folder per URL)
│   ├── page.tsx        ← public landing page
│   ├── pricing/        ← public pricing page
│   ├── (auth)/         ← login, register, password reset, magic link…
│   ├── dashboard/      ← signed-in user area
│   └── admin/          ← admin console (guarded)
├── components/         ← shared React components (ui/ = shadcn primitives)
├── lib/
│   ├── apiClient.ts    ← the only way to call the API (never raw fetch())
│   └── server-state/   ← TanStack Query hooks per domain — pages import these, not apiClient
├── config/             ← brand.ts (rename/rebrand), pricing.ts (displayed plan prices)
└── i18n/               ← locales (EN/ES/FR/AR with RTL)
e2e/                    ← Playwright smoke tests (run in CI against the real API)
```

Data flow for a page: **page component → `lib/server-state/<domain>.ts` hook →
`lib/apiClient.ts` → API**. To add a new data fetch, extend the domain module —
don't call `apiClient` from a page.

## Where do I add…?

| I want to add…            | Put it in…                                                                    |
| ------------------------- | ----------------------------------------------------------------------------- |
| A new API endpoint        | `src/api/routes/<resource>.routes.ts`, mount it in `src/api/server.ts`; use `routeHandler()`, `zValidator()`, `parsePaginatedQuery()` from the canonical modules |
| Business logic            | `src/services/<domain>/` — routes stay thin                                   |
| A multi-step DB write     | A repository method in `src/db/repositories/` that owns the transaction        |
| A DB table/column         | `src/db/schema/`, then `bun run db:generate` → migration in `drizzle/`         |
| A dashboard page          | `packages/ui/src/app/dashboard/<name>/page.tsx` + a `lib/server-state` module |
| An OAuth provider         | `plugins/oauth/providers/` (see [`docs/extending.md`](./extending.md))         |
| An email                  | Template in `src/templates/`, send via the email queue service                 |
| A scheduled job           | `src/jobs/` — registered by the scheduler, executed by `src/worker.ts`         |

## Before you open a PR

1. `bun run lint:fix && bun run type-check && bun run test`
2. Touching auth/crypto? Re-read the security table in [`CLAUDE.md`](../CLAUDE.md) — the CWE rules are review blockers.
3. Branch off `main`, conventional-commit messages, PR to `main`.

## Deeper dives

| Topic                 | Doc                                                          |
| --------------------- | ------------------------------------------------------------ |
| System architecture   | [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)                   |
| Deployment            | [`docs/deployment.md`](./deployment.md)                       |
| Security baseline     | [`docs/security.md`](./security.md)                           |
| Plugins               | [`docs/plugins.md`](./plugins.md)                             |
| Adding integrations   | [`docs/extending.md`](./extending.md)                         |
| Production checklist  | [`docs/production-checklist.md`](./production-checklist.md)   |
| What ships today      | [`docs/project/shipped.md`](./project/shipped.md)             |
