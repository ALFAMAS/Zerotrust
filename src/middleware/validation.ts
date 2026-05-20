import type { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";
import { ErrorCodes } from "../shared/types";

export function validate<T>(schema: ZodSchema<T>, source: "body" | "query" | "params" = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({
        code: ErrorCodes.INVALID_REQUEST,
        message: "Validation failed",
        details,
      });
      return;
    }
    req[source] = result.data as any;
    next();
  };
}

export function requireFields(...fields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const body = req.body || {};
    for (const f of fields) {
      if (body[f] === undefined || body[f] === null || body[f] === "") {
        res.status(400).json({
          code: ErrorCodes.INVALID_REQUEST,
          message: "Validation failed",
          details: [{ field: f, message: `Missing field: ${f}` }],
        });
        return;
      }
    }
    next();
  };
}

export function allowOnlyMethods(...methods: string[]) {
  const allowed = methods.map((m) => m.toUpperCase());
  return (req: Request, res: Response, next: NextFunction) => {
    if (!allowed.includes(req.method.toUpperCase())) {
      res.status(405).json({
        code: ErrorCodes.INVALID_REQUEST,
        message: `Method not allowed. Allowed: ${allowed.join(", ")}`,
        details: [],
      });
      return;
    }
    next();
  };
}
