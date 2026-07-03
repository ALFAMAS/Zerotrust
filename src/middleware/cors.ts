/**
 * CORS origin policy.
 *
 * The server previously mounted `cors()` with no options, which emits
 * `Access-Control-Allow-Origin: *` for every request. For a credentialed auth
 * API that is a production-readiness gap (checklist #61): any website can script
 * cross-origin calls against it. This module resolves the allowed origin from an
 * explicit allowlist so production deployments only answer the origins they
 * configure, while local development stays friction-free.
 *
 * Configure via `CORS_ALLOWED_ORIGINS` (comma-separated). `APP_URL` is always
 * trusted. Set `CORS_ALLOWED_ORIGINS=*` to deliberately opt back into wildcard.
 *
 * In non-production, when no allowlist is configured, only localhost dev
 * origins (and `APP_URL`) are permitted — arbitrary origins are not reflected.
 */

import type { cors } from "hono/cors";

/** Browser origins allowed in development when `CORS_ALLOWED_ORIGINS` is unset. */
export const DEV_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:1337",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:1337",
] as const;

type CorsOptions = Parameters<typeof cors>[0];

export interface CorsPolicy {
  allowedOrigins: string[];
  allowWildcard: boolean;
  isProduction: boolean;
}

/** Parse the runtime CORS policy from environment variables. */
export function corsPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): CorsPolicy {
  const raw = (env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowWildcard = raw.includes("*");
  // Normalize trailing slashes so "https://app.example/" matches a request
  // Origin of "https://app.example" (browsers never send a trailing slash).
  const allowed = new Set(raw.filter((o) => o !== "*").map((o) => o.replace(/\/$/, "")));
  if (env.APP_URL) allowed.add(env.APP_URL.replace(/\/$/, ""));
  return {
    allowedOrigins: [...allowed],
    allowWildcard,
    isProduction: env.NODE_ENV === "production",
  };
}

/**
 * Decide the `Access-Control-Allow-Origin` value for a given request origin.
 *
 * - Explicit wildcard opt-in → `*`.
 * - Origin on the allowlist → reflect it (enables credentialed requests safely).
 * - No allowlist configured, non-production → allow only {@link DEV_CORS_ORIGINS}
 *   plus `APP_URL` (no reflect-any).
 * - No allowlist configured, production → deny (return `null`): fail closed.
 */
export function resolveCorsOrigin(
  requestOrigin: string | undefined,
  policy: CorsPolicy
): string | null {
  if (policy.allowWildcard) return "*";
  const origin = requestOrigin?.replace(/\/$/, "");
  if (origin && policy.allowedOrigins.includes(origin)) return origin;
  if (policy.allowedOrigins.length === 0 && !policy.isProduction) {
    if (origin && (DEV_CORS_ORIGINS as readonly string[]).includes(origin)) return origin;
    return null;
  }
  return null;
}

/** Build the options object for hono's `cors()` middleware from the env policy. */
export function corsOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const policy = corsPolicyFromEnv(env);
  return {
    origin: (origin) => resolveCorsOrigin(origin, policy),
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With", "x-device-fingerprint"],
    maxAge: 600,
  };
}
