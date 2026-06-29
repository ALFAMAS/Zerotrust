/**
 * Canonical shared modules barrel export.
 *
 * Backend: import { ok, fail, routeHandler, dbGuard } from "@/shared/apiHelpers"
 * Frontend: import { useApi, usePaginatedApi } from "@/hooks/useApi"
 *           import { LoadingSpinner, EmptyState, ErrorState } from "@/components/ui/States"
 */

// Backend helpers
export {
  ok,
  fail,
  internalError,
  routeHandler,
  HttpError,
  dbGuard,
} from "../../../shared/apiHelpers.js";

// Pagination (already exists)
export {
  parsePaginatedQuery,
  paginated,
  type PaginationParams,
  type PaginatedMeta,
  type PaginatedResponse,
} from "../../../shared/pagination.js";
