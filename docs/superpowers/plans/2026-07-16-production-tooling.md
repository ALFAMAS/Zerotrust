# Production tooling implementation plan

1. Install compatible Bull Board, Pino, Testcontainers, React Email CLI, and development transport packages.
2. Add tested canonical BullMQ queue names and Redis connection parsing; migrate existing queue producers/consumers.
3. Add failing route/gating tests, mount Bull Board behind the existing admin middleware, and document the feature flag.
4. Characterize the logger API and redaction behavior with tests, then swap serialization to Pino without changing callers.
5. Add a dedicated Testcontainers Vitest configuration and global setup for pinned PostgreSQL/Redis services.
6. Add nine React Email preview wrappers and the `email:dev` script.
7. Run focused tests after each slice, then full tests, type-checks, lint, boundaries, dead-code, and production builds.
