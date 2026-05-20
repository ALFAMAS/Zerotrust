import type { Request, Response, NextFunction } from "express";
import { ErrorCodes } from "../shared/types";

// Very small validation helpers — use Zod/Joi in production
export function requireFields(...fields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const body = req.body || {};
    for (const f of fields) {
      if (body[f] === undefined || body[f] === null || body[f] === "") {
        res.status(400).json({ error: ErrorCodes.INVALID_REQUEST, message: `Missing field: ${f}` });
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
      res
        .status(405)
        .json({
          error: ErrorCodes.INVALID_REQUEST,
          message: `Method not allowed. Allowed: ${allowed.join(", ")}`,
        });
      return;
    }
    next();
  };
}
