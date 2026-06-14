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
the terminal via `experimental.browserDebugInfoInTerminal: true` in
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
