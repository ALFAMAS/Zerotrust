import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { collectDefaultMetrics, register } from "prom-client";
import type { HonoEnv } from "../shared/types";
import { requestDurationSeconds } from "./counters";

collectDefaultMetrics({ register });

export function metricsMiddleware() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const start = Date.now();
    await next();
    const durationSec = (Date.now() - start) / 1000;
    const route = c.req.routePath ?? c.req.path ?? "unknown";
    const method = c.req.method ?? "unknown";
    const statusCode = String(c.res.status);
    requestDurationSeconds.observe({ method, route, status_code: statusCode }, durationSec);
  });
}

export async function metricsRoute(c: Context<HonoEnv>): Promise<Response> {
  try {
    const metrics = await register.metrics();
    return new Response(metrics, {
      status: 200,
      headers: { "Content-Type": register.contentType },
    });
  } catch (err) {
    return c.text(String(err), 500);
  }
}
