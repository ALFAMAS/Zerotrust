import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../shared/types";
import { requestDurationSeconds } from "./counters";
import { metricsRegistry } from "./registry";

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

/**
 * Optional bearer-token gate for the `/metrics` scrape endpoint. When
 * `METRICS_AUTH_TOKEN` is set, scrapers must send `Authorization: Bearer
 * <token>`; when unset the endpoint is open (dev / private-network friendly).
 */
export function metricsAuthMiddleware() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const required = process.env.METRICS_AUTH_TOKEN;
    if (required) {
      const auth = c.req.header("authorization");
      if (auth !== `Bearer ${required}`) {
        return c.json({ error: "UNAUTHORIZED", message: "Invalid metrics token" }, 401);
      }
    }
    return next();
  });
}

export async function metricsRoute(c: Context<HonoEnv>): Promise<Response> {
  try {
    // Serve the app's own registry — every zerotrust_* counter/histogram is
    // registered on `metricsRegistry` (see counters.ts / slo.service.ts), NOT on
    // prom-client's default registry. Reading the default registry here would
    // expose an empty/irrelevant scrape.
    const metrics = await metricsRegistry.metrics();
    return new Response(metrics, {
      status: 200,
      headers: { "Content-Type": metricsRegistry.contentType },
    });
  } catch (err) {
    return c.text(String(err), 500);
  }
}
