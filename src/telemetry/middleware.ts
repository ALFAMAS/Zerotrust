import type { RequestHandler, Request, Response, NextFunction } from "express";
import { trace, context } from "@opentelemetry/api";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      traceId?: string;
    }
  }
}

export function tracingMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const span = trace.getSpan(context.active());
    if (span) {
      const spanContext = span.spanContext();
      req.traceId = spanContext.traceId;
      res.setHeader("X-Trace-Id", spanContext.traceId);
    }
    next();
  };
}
