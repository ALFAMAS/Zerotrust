# ADR 002: Modular Monolith Architecture

**Status:** Accepted
**Date:** 2026-01 (initial), documented 2026-07-01
**Deciders:** Project maintainers

## Context

zerotrust is a full-stack auth template — a Hono API server, a Next.js UI, and
a generated TypeScript SDK. The codebase needs to be:

- **Debuggable without distributed-systems tooling** — a single process for the
  common case, where a breakpoint or stack trace surfaces the full call path.
- **Splittable when needed** — if a future deployment needs separate API and
  worker processes, the code should accommodate that without a rewrite.
- **Maintainable by small teams** — no internal HTTP calls, queues, or
  serialization between domains for the same request.

## Decision

Ship as a **modular monolith** — one Hono API process that exposes ~27 route
modules backed by ~45 services and ~21 middleware, persisting to PostgreSQL.
Domains call each other in-process. There are no internal network hops.

The monolith is "modular" in that:

- Routes are independently mounted in `src/api/server.ts` and each applies its
  own guards (`authMiddleware`, `rateLimiting`, `requirePlan`, etc.).
- Services are pure TypeScript modules with explicit dependencies.
- The worker process (`src/worker.ts`) shares the same service and repository
  code — no duplication (P1.2).

## Alternatives considered

| Option | Why rejected |
|---|---|
| **Microservices from day one** | The team size and throughput don't warrant distributed complexity — network partitions, retry/backoff, trace propagation, and API versioning across service boundaries are solving problems we don't have yet. |
| **BFF (Backend-for-Frontend) pattern** | Adding a separate API layer between the Next.js app and the Hono API adds serialization overhead and an extra deployable with no clear benefit — the Next.js app already has `apiClient` and the generated SDK typing the contract. |
| **Lambda-style per-route functions** | Cold starts, connection-pool management, and Drizzle ORM lifecycle are worse in a per-function model. The monolith's in-memory connection pooling and startup-time schema initialisation work well. |

## Consequences

- **Positive:** Simple local development — `bun dev` starts the API and UI
  concurrently. A single debugger attaches to the full request path. No
  service-discovery or inter-process auth.
- **Positive:** Shared canonical modules (`src/shared/*`) are available to every
  route and service without packaging or publishing.
- **Positive:** Splitting paths later (worker process, read-replica routing) is
  a refactor of `startServer()`, not a migration of IPC protocols.
- **Negative:** Background schedulers duplicate work when cluster deploys omit
  `WORKER_MODE=true`. Production topology enforcement (P1.2) defers schedulers
  to the dedicated worker and warns on misconfiguration.
- **Negative:** Module boundaries are enforced via `.boundaries.json` +
  `scripts/check-boundaries.ts` (P2.2, ADR 007).

## References

- Architecture doc: `docs/ARCHITECTURE.md`
- Worker split: `src/worker.ts`, `src/jobs/topology.ts` (P1.2 shipped)
- Module boundaries: `.boundaries.json`, ADR 007 (P2.2 shipped)
- `src/api/server.ts` — route mounting and global middleware chain
