import { createMiddleware } from "hono/factory";
import { getLogger } from "../logger";
import type { HonoEnv } from "../shared/types";

const logger = getLogger("telemetry-middleware");

export function telemetryMiddleware() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const startedAt = Date.now();
    const incoming = c.req.header("x-trace-id");
    const traceId = incoming ?? crypto.randomUUID();
    await next();
    c.res.headers.set("X-Trace-Id", traceId);
    logger.info("HTTP request completed", {
      durationMs: Date.now() - startedAt,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      traceId,
    });
  });
}
