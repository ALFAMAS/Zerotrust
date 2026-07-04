"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalError = internalError;
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
function internalError(c, logger, logLabel, err, clientMessage) {
    logger.error(logLabel, err);
    return c.json(clientMessage
        ? { error: "INTERNAL_ERROR", message: clientMessage }
        : { error: "INTERNAL_ERROR" }, 500);
}
//# sourceMappingURL=httpErrors.js.map