import { zValidator as honoZValidator } from "@hono/zod-validator";
import type { Context, Env, MiddlewareHandler, ValidationTargets } from "hono";
import type { ZodSchema } from "zod";

type ValidationTarget = keyof ValidationTargets;

/**
 * Canonical `@hono/zod-validator` wrapper — returns 422 with a stable envelope
 * on schema failure. Use parsed output via `c.req.valid(target)` in handlers.
 */
export function zValidator<
  T extends ZodSchema,
  Target extends ValidationTarget,
  E extends Env = Env,
  P extends string = string,
>(target: Target, schema: T): MiddlewareHandler<E, P> {
  return honoZValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "VALIDATION_ERROR",
          message: "Request validation failed",
          issues: result.error.issues,
        },
        422
      );
    }
  }) as MiddlewareHandler<E, P>;
}

/** Read validated body after `zValidator("json", schema)` — typed helper. */
export function validatedJson<T>(c: Context, _schema?: ZodSchema<T>): T {
  return c.req.valid("json" as never) as T;
}
