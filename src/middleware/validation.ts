import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../shared/types";
import { ErrorCodes } from "../shared/types";

export function requireFields(...fields: string[]) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const body = await c.req.json().catch(() => ({}));
    for (const f of fields) {
      if (body[f] === undefined || body[f] === null || body[f] === "") {
        return c.json({ error: ErrorCodes.INVALID_REQUEST, message: `Missing field: ${f}` }, 400);
      }
    }
    return next();
  });
}

export function allowOnlyMethods(...methods: string[]) {
  const allowed = methods.map((m) => m.toUpperCase());
  return createMiddleware<HonoEnv>(async (c, next) => {
    if (!allowed.includes(c.req.method.toUpperCase())) {
      return c.json(
        { error: ErrorCodes.INVALID_REQUEST, message: `Method not allowed. Allowed: ${allowed.join(", ")}` },
        405
      );
    }
    return next();
  });
}

export function validate<T>(schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: { issues: { path: (string | number)[]; message: string }[] } } }, source: "body" | "query" = "body") {
  return createMiddleware<HonoEnv>(async (c, next) => {
    let data: unknown;
    if (source === "body") {
      data = await c.req.json().catch(() => ({}));
    } else {
      data = c.req.query();
    }
    const result = schema.safeParse(data);
    if (!result.success) {
      const details = result.error!.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      return c.json({ error: ErrorCodes.INVALID_REQUEST, message: "Validation failed", details }, 400);
    }
    return next();
  });
}
