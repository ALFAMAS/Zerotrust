import { createMiddleware } from "hono/factory";
import { isCaptchaEnabled, verifyCaptchaToken } from "../services/auth/captcha.service";
import { getClientIp } from "../shared/clientIp";
import type { HonoEnv } from "../shared/types";

/**
 * Optional CAPTCHA gate for unauthenticated auth endpoints.
 * No-op when CAPTCHA_ENABLED is unset/false.
 */
export function captchaGuard() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    if (!isCaptchaEnabled()) {
      return next();
    }

    let captchaToken: string | undefined;
    try {
      const body = (await c.req.raw.clone().json()) as { captchaToken?: unknown };
      captchaToken = typeof body.captchaToken === "string" ? body.captchaToken : undefined;
    } catch {
      captchaToken = undefined;
    }

    if (!captchaToken) {
      return c.json(
        { error: "CAPTCHA_REQUIRED", message: "CAPTCHA verification is required" },
        400
      );
    }

    const result = await verifyCaptchaToken(captchaToken, getClientIp(c));
    if (!result.ok) {
      return c.json({ error: "CAPTCHA_FAILED", message: "CAPTCHA verification failed" }, 403);
    }

    return next();
  });
}
