import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../shared/types";

export function telemetryMiddleware() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const incoming = c.req.header("x-trace-id");
    const traceId = incoming ?? crypto.randomUUID();
    await next();
    c.res.headers.set("X-Trace-Id", traceId);
  });
}
