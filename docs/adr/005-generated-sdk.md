# ADR 005: Generated TypeScript SDK from OpenAPI Spec

**Status:** Accepted
**Date:** 2026-06 (consolidated), documented 2026-07-01
**Deciders:** Project maintainers

## Context

The Next.js UI (and any external API consumer) needs to call the Hono API with:

- **Type-safe request/response shapes** — a breaking API change should fail at
  compile time in the consumer, not at runtime in production.
- **Zero runtime dependencies** — the SDK should be a thin wrapper around
  `fetch` with TypeScript types, not a heavy client library.
- **A single source of truth** — route signatures should be defined once and
  consumed everywhere, not hand-duplicated across UI components.

## Decision

Generate a dependency-free TypeScript SDK (`packages/client/`) from the Hono
API's OpenAPI spec (`src/api/openapi.json`).

- The Hono API exports its route definitions as an OpenAPI 3.1 spec.
- `scripts/generate-sdk.ts` reads the spec and produces typed request functions
  and response interfaces in `packages/client/src/`.
- The UI imports the SDK directly, and `packages/ui/src/lib/apiClient.ts`
  wraps the generated functions with auth-token injection and error handling.
- CI checks SDK freshness: `bun run sdk:check` regenerates and fails on
  diff — merged into the broader `verify:generated` drift gate.

## Alternatives considered

| Option | Why rejected |
|---|---|
| **Hand-written TypeScript interfaces** | Drift between the API and the UI is inevitable; every hand-synced interface is a bug waiting to happen. |
| **tRPC / GraphQL** | Adds a protocol layer and lock-in; REST/OpenAPI is universally understood and toolable (Swagger UI, Postman, curl). |
| **Fully-featured SDK generator (OpenAPI Generator)** | Produces heavy, dated clients with runtime deps. The thin wrapper approach keeps the SDK dependency-free and reviewable. |
| **No generated SDK (raw fetch + `as` casts)** | The 213 `as any` casts in `src/` demonstrate what happens without typed contracts. The SDK is the antidote. |

## Consequences

- **Positive:** API changes that break the contract fail CI (via
  `verify:generated`). The SDK regenerates in seconds, keeping the UI and
  published SDK in lockstep.
- **Positive:** Dependency-free — consumers import types and a thin fetch
  wrapper, nothing else. The SDK works in browsers, Node, Bun, and Deno.
- **Positive:** Swagger UI at `/docs` (dev) surfaces the full API for manual
  exploration, and the generated SDK means that exploration translates directly
  to typed imports.
- **Negative:** The generator script is custom and must be maintained alongside
  the Hono `describeRoute` calls. A route without OpenAPI metadata silently
  produces no SDK function.
- **Negative:** External consumers get a snapshot at each release; they won't
  see breaking changes until they upgrade the SDK package.

## References

- SDK generator: `scripts/generate-sdk.ts`
- SDK source: `packages/client/src/index.ts`
- OpenAPI spec: `src/api/openapi.json`
- API client wrapper: `packages/ui/src/lib/apiClient.ts`
- Drift gate: `package.json` → `verify:generated`
