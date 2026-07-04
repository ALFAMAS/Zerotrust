/**
 * Frontend hooks barrel.
 *
 * Server data fetching uses TanStack Query hooks in `@/lib/server-state/*`.
 * See `docs/ui-http-client.md` and `docs/tanstack-query-progress.md`.
 *
 * Backend helpers (`apiHelpers`, `pagination`) live in the server-side
 * `src/shared/*` tree and must not be re-exported here — importing them would
 * pull server code into the client bundle.
 */
