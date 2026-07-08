import { zValidator as honoZValidator } from "@hono/zod-validator";
import type { Context, ValidationTargets } from "hono";
import type { ZodSchema } from "zod";

/**
 * Canonical `@hono/zod-validator` wrapper — returns 422 with a stable envelope
 * on schema failure. Use parsed output via `c.req.valid(target)` in handlers.
 */
export function zValidator<TTarget extends keyof ValidationTargets, TSchema extends ZodSchema>(
  target: TTarget,
  schema: TSchema
) {
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
    return undefined;
  });
}

/** Read validated body after `zValidator("json", schema)` — typed helper. */
export function validatedJson<T>(c: Context, _schema?: ZodSchema<T>): T {
  return (c.req as unknown as { valid: (target: string) => unknown }).valid("json") as T;
}
