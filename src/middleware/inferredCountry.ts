import { createMiddleware } from "hono/factory";
import { inferClientCountry } from "../shared/inferClientCountry";
import type { HonoEnv } from "../shared/types";

/** Attach ISO country inferred from the client IP for session creation and risk scoring. */
export function inferredCountryMiddleware() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    c.set("inferredCountry", inferClientCountry(c));
    await next();
  });
}
