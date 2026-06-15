# ZeroAuth — Claude Code Guide

## Project structure

Monorepo: Node/Hono API (`src/`) + Next.js 16 UI (`packages/ui/`).

| Layer        | Path                            | Port                              |
| ------------ | ------------------------------- | --------------------------------- |
| API server   | `src/api/server.ts`             | 1337                              |
| UI (Next.js) | `packages/ui/`                  | 3000                              |
| MCP server   | auto-started with UI dev server | `http://localhost:3000/_next/mcp` |

## Running the project

```bash
bun dev          # starts API + UI concurrently
bun dev:api      # API only
bun dev:ui       # UI only (also starts MCP server)
bun run test     # vitest test suite (236 tests)
bun run db:backup # one-shot pg_dump backup with retention pruning
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
  services/         Business logic (email, MFA, OAuth, SAML…)
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
- **Lint**: `bun run lint:fix` — ESLint + Prettier run automatically on commit via husky

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
| `/security-review`         | Auth-critical changes (OAuth, SAML, MFA, WebAuthn, CSFLE, breach checks) |
| `/code-review`             | Review the current diff before opening a PR                              |
| `/test-driven-development` | New API routes/services — write the vitest first                         |
| `/test-fixing`             | Triage and fix failing vitest runs                                       |
| `/postgres`                | Read-only queries against the Drizzle/Postgres DB                        |
| `/frontend-design`         | Next.js UI work (shadcn redesign in progress)                            |
| `/webapp-testing`          | Drive/verify the UI with Playwright                                      |
| `/verify` · `/run`         | Confirm a change works in the running app, not just in tests             |
| `/changelog-generator`     | Release notes (repo uses semantic-release + conventional commits)        |
| `/graphify`                | Refresh the knowledge graph (`graphify-out/`) — first step of shipping   |
