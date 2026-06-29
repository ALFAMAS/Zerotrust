/**
 * Shared HTTP error helpers for Hono route handlers.
 *
 * The vast majority of route `catch` blocks share one shape: log the error with
 * a route-scoped label, then return the canonical `{ error: "INTERNAL_ERROR" }`
 * envelope with a 500. This module collapses that boilerplate:
 *
 *   } catch (err) {
 *     logger.error("Get notifications error", err as Error);
 *     return c.json({ error: "INTERNAL_ERROR", message: "Failed to ..." }, 500);
 *   }
 *
 * becomes:
 *
 *   } catch (err) {
 *     return internalError(c, logger, "Get notifications error", err, "Failed to ...");
 *   }
 *
 * Keeping the format in one place means every 500 stays consistent (CWE-532:
 * never leak the raw error to the client — only a stable code + safe message).
 */
import type { Context } from "hono";
import type { getLogger } from "../logger";

type Logger = ReturnType<typeof getLogger>;

/**
 * Log an unexpected error and return the standard 500 envelope.
 *
 * @param c            The Hono context.
 * @param logger       A route-scoped logger (`getLogger("...-routes")`).
 * @param logLabel     Server-side log label (never sent to the client).
 * @param err          The caught error (logged, never serialized to the client).
 * @param clientMessage Optional safe message for the client. Omit for a bare
 *                      `{ error: "INTERNAL_ERROR" }` body.
 */
export function internalError(
  c: Context,
  logger: Logger,
  logLabel: string,
  err: unknown,
  clientMessage?: string
) {
  logger.error(logLabel, err as Error);
  return c.json(
    clientMessage
      ? { error: "INTERNAL_ERROR", message: clientMessage }
      : { error: "INTERNAL_ERROR" },
    500
  );
}
