/**
 * Security response headers for the Next.js UI (CSP, HSTS, frame denial).
 *
 * Mirrors the API's `src/middleware/securityHeaders.ts` defaults but adapts for
 * Next.js: dev allows Turbopack/HMR (`unsafe-eval`, `ws:`); production is
 * stricter. Override the full CSP with `UI_CSP` or use report-only mode via
 * `UI_CSP_REPORT_ONLY=true` while tuning policy.
 */

const isDevelopment = () => process.env.NODE_ENV === "development";

/** API origin the browser may call (Bearer client). */
function apiConnectOrigins(): string[] {
  const apiUrl = process.env.NEXT_PUBLIC_ZEROTRUST_URL ?? "http://localhost:1337";
  try {
    const { origin } = new URL(apiUrl);
    return [origin];
  } catch {
    return ["http://localhost:1337"];
  }
}

function analyticsScriptOrigins(): string[] {
  const origins: string[] = [];
  if (process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN) {
    origins.push("https://plausible.io");
  }
  if (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) {
    origins.push("https://www.googletagmanager.com", "https://www.google-analytics.com");
  }
  return origins;
}

function liveChatScriptOrigins(): string[] {
  const origins: string[] = [];
  if (process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
    origins.push("https://client.crisp.chat");
  }
  if (process.env.NEXT_PUBLIC_INTERCOM_APP_ID) {
    origins.push("https://widget.intercom.io", "https://js.intercomcdn.com");
  }
  if (process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID) {
    origins.push("https://embed.tawk.to");
  }
  return origins;
}

function buildDefaultCsp(): string {
  if (process.env.UI_CSP) {
    return process.env.UI_CSP;
  }

  const apiOrigins = apiConnectOrigins();
  const scriptExtras = [
    "'self'",
    "'unsafe-inline'",
    ...(isDevelopment() ? ["'unsafe-eval'"] : []),
    ...analyticsScriptOrigins(),
    ...liveChatScriptOrigins(),
    "https://js.stripe.com",
  ];
  const connectExtras = [
    "'self'",
    ...apiOrigins,
    ...(isDevelopment() ? ["ws:", "wss:", "http://localhost:*", "http://127.0.0.1:*"] : []),
    "https://api.stripe.com",
    "https://*.ingest.sentry.io",
    ...analyticsScriptOrigins(),
  ];

  const directives = [
    "default-src 'self'",
    `script-src ${[...new Set(scriptExtras)].join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${[...new Set(connectExtras)].join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  if (process.env.UI_CSP_REPORT_URI) {
    directives.push(`report-uri ${process.env.UI_CSP_REPORT_URI}`);
  }

  return directives.join("; ");
}

export function buildUiSecurityHeaders(): Array<{ key: string; value: string }> {
  const csp = buildDefaultCsp();
  const cspHeader =
    process.env.UI_CSP_REPORT_ONLY === "true"
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";

  const headers: Array<{ key: string; value: string }> = [
    { key: cspHeader, value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
    { key: "X-XSS-Protection", value: "0" },
  ];

  // HSTS on localhost breaks dev; only send in production.
  if (process.env.NODE_ENV === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}
