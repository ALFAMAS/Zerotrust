/**
 * Provider-agnostic CAPTCHA verification for auth endpoints.
 *
 * Off by default — enable with CAPTCHA_ENABLED=true. Supports Cloudflare
 * Turnstile, hCaptcha, and Google reCAPTCHA via CAPTCHA_PROVIDER.
 *
 * Never log raw tokens (CWE-532).
 */
import { getLogger } from "../../logger";
import { fetchFixedUrl } from "../../shared/safeFetch";

const logger = getLogger("captcha");

export type CaptchaProvider = "turnstile" | "hcaptcha" | "recaptcha";

export interface CaptchaConfig {
  enabled: boolean;
  provider: CaptchaProvider;
  secret: string;
}

const PROVIDER_VERIFY_URL: Record<CaptchaProvider, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  hcaptcha: "https://api.hcaptcha.com/siteverify",
  recaptcha: "https://www.google.com/recaptcha/api/siteverify",
};

function parseProvider(raw: string | undefined): CaptchaProvider {
  const normalized = (raw ?? "turnstile").toLowerCase();
  if (normalized === "hcaptcha" || normalized === "recaptcha" || normalized === "turnstile") {
    return normalized;
  }
  return "turnstile";
}

/** Read CAPTCHA config from env. Disabled unless CAPTCHA_ENABLED=true. */
export function getCaptchaConfig(): CaptchaConfig {
  const enabled = process.env.CAPTCHA_ENABLED === "true";
  const secret = process.env.CAPTCHA_SECRET ?? "";
  return {
    enabled,
    provider: parseProvider(process.env.CAPTCHA_PROVIDER),
    secret,
  };
}

export function isCaptchaEnabled(): boolean {
  const cfg = getCaptchaConfig();
  return cfg.enabled && cfg.secret.length > 0;
}

interface ProviderResponse {
  success?: boolean;
  "error-codes"?: string[];
}

/** Verify a client-submitted CAPTCHA token with the configured provider. */
export async function verifyCaptchaToken(
  token: string,
  remoteIp?: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cfg = getCaptchaConfig();
  if (!cfg.enabled) {
    return { ok: true };
  }
  if (!cfg.secret) {
    logger.error("CAPTCHA_ENABLED but CAPTCHA_SECRET is missing");
    return { ok: false, reason: "misconfigured" };
  }
  if (!token || typeof token !== "string" || token.length > 4096) {
    return { ok: false, reason: "missing_token" };
  }

  const verifyUrl = PROVIDER_VERIFY_URL[cfg.provider];
  const body = new URLSearchParams({
    secret: cfg.secret,
    response: token,
  });
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  try {
    const res = await fetchFixedUrl(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn("CAPTCHA provider HTTP error", {
        provider: cfg.provider,
        status: res.status,
      });
      return { ok: false, reason: "provider_error" };
    }

    const data = (await res.json()) as ProviderResponse;
    if (data.success) {
      return { ok: true };
    }

    logger.info("CAPTCHA verification failed", {
      provider: cfg.provider,
      errorCodes: data["error-codes"] ?? [],
    });
    return { ok: false, reason: "verification_failed" };
  } catch (err) {
    logger.warn("CAPTCHA provider request failed", {
      provider: cfg.provider,
      error: String(err),
    });
    return { ok: false, reason: "provider_unreachable" };
  }
}
