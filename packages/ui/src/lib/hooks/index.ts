/**
 * Frontend hooks barrel.
 *
 *   import { useApi, usePaginatedApi } from "@/lib/hooks";
 *
 * Backend helpers (`apiHelpers`, `pagination`) live in the server-side
 * `src/shared/*` tree and must not be re-exported here — importing them would
 * pull server code into the client bundle.
 */

export { useApi, usePaginatedApi } from "./useApi";
