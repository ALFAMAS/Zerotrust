/**
 * Shared backend utilities for route handlers, services, and middleware.
 *
 * Extends the canonical modules table in CLAUDE.md:
 * - route()     — wrap handlers with automatic error handling
 * - ok()        — success response shorthand
 * - fail()      — error response shorthand
 * - dbGuard     — Drizzle query wrapper with storage-fallback safety
 */

import type { Context } from "hono";
import { internalErrorResponse } from "../api/errorHandler.js";
import { getLogger } from "../logger/index.js";
import type { HonoEnv } from "./types.js";

const logger = getLogger("shared-utils");

// ─── Response Helpers ────────────────────────────────────────────────────────

/** Standard success response. */
export function ok<T>(c: Context, data: T, status = 200) {
  return c.json(data, status as any);
}

/** Standard error response from a known error code/message. */
export function fail(c: Context, status: number, code: string, message?: string) {
  return c.json({ error: code, message: message ?? code }, status as any);
}

/** Internal error response — logs the real error, returns a safe message. */
export function internalError(c: Context, err: unknown, label?: string) {
  return internalErrorResponse(c, logger, label ?? "Internal API error", err);
}

// ─── Route Handler Wrapper ───────────────────────────────────────────────────

/**
 * Wrap a route handler with automatic error handling.
 *
 * Usage:
 *   router.get("/users", routeHandler(async (c) => {
 *     const users = await listUsers();
 *     return c.json(paginated(users, { page: 1, limit: 20, total: 100 }));
 *   }));
 *
 * On thrown Error → 500 with the error message
 * On thrown { _httpStatus, _errorCode } → that status/code
 */
export function routeHandler<T extends Context<HonoEnv>>(
  fn: (c: T) => Promise<Response>
): (c: T) => Promise<Response> {
  return async (c: T) => {
    try {
      return await fn(c);
    } catch (err: any) {
      if (err?._httpStatus && err._errorCode) {
        return c.json({ error: err._errorCode, message: err.message }, err._httpStatus);
      }
      const path = c.req.path;
      return internalErrorResponse(c, logger, `Route error ${path}`, err);
    }
  };
}

/** Throw this from inside a routeHandler to return a specific HTTP status. */
export class HttpError extends Error {
  _httpStatus: number;
  _errorCode: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this._httpStatus = status;
    this._errorCode = code;
  }
}

// ─── DB Query Guard ─────────────────────────────────────────────────────────

import { isUnavailableStorageError } from "../db/storageFallback.js";

interface DbGuardOptions {
  /** Label logged on error. */
  operation?: string;
  /** Value returned when the table/column doesn't exist yet (graceful degradation). */
  fallback?: () => any;
}

/**
 * Wrap a Drizzle query in a try-catch that handles storage-unavailable errors
 * (table/column missing because migrations haven't run). Logs the error and
 * returns the fallback value instead of crashing.
 *
 * Usage:
 *   const users = await dbGuard(
 *     () => db.select().from(usersTable).where(...).limit(20),
 *     { operation: "listUsers", fallback: () => [] }
 *   );
 */
export async function dbGuard<T>(query: () => Promise<T>, opts: DbGuardOptions = {}): Promise<T> {
  try {
    return await query();
  } catch (err) {
    if (isUnavailableStorageError(err, [])) {
      if (opts.fallback) {
        logger.warn(`Storage unavailable during ${opts.operation ?? "query"} — using fallback`);
        return opts.fallback();
      }
    }
    throw err;
  }
}
