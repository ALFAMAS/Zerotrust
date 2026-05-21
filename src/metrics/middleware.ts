import type { RequestHandler, Request, Response, NextFunction } from "express";
import { metricsRegistry } from "./registry";
import { requestDurationSeconds } from "./counters";

export function metricsMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();

    res.on("finish", () => {
      const durationNs = process.hrtime.bigint() - start;
      const durationSec = Number(durationNs) / 1e9;

      const route = (req.route?.path as string | undefined) ?? req.path ?? "unknown";
      const method = req.method ?? "unknown";
      const statusCode = String(res.statusCode);

      requestDurationSeconds.observe(
        { method, route, status_code: statusCode },
        durationSec
      );
    });

    next();
  };
}

export function metricsRoute(): RequestHandler {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await metricsRegistry.metrics();
      res.set("Content-Type", metricsRegistry.contentType);
      res.end(metrics);
    } catch (err) {
      res.status(500).end(String(err));
    }
  };
}
