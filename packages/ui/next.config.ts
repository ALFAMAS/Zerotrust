import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const uiRoot = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(uiRoot, "../..");
import { enforceProductionApiUrl } from "./src/config/publicApiUrl";
import { buildUiSecurityHeaders } from "./src/config/securityHeaders";
import { UI_ROUTE_REDIRECTS } from "./src/config/uiRouteRedirects";

if (process.env.ZEROTRUST_ENFORCE_PUBLIC_API_URL === "true") {
  enforceProductionApiUrl(process.env.NEXT_PUBLIC_ZEROTRUST_URL);
}

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  // Allows production verification to run alongside `next dev` without both
  // processes contending for the same .next directory. Defaults are unchanged.
  distDir: process.env.ZEROTRUST_NEXT_DIST_DIR ?? ".next",

  // Keep server-only telemetry hooks external in dev/build so Turbopack does
  // not rewrite optional OpenTelemetry/Sentry shims into synthetic package
  // names such as require-in-the-middle-<hash>.
  serverExternalPackages: [
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/instrumentation",
    "@sentry/nextjs",
    "import-in-the-middle",
    "require-in-the-middle",
  ],

  env: {
    NEXT_PUBLIC_ZEROTRUST_URL:
      process.env.NEXT_PUBLIC_ZEROTRUST_URL ?? "http://localhost:1337",
  },

  turbopack: {
    // Add custom webpack-style loaders here when needed, e.g.:
    // rules: { "*.svg": { loaders: ["@svgr/webpack"], as: "*.js" } },
    //
    // Add module aliases here when needed, e.g.:
    // resolveAlias: { "some-package": "./src/mocks/some-package.ts" },
  },

  // Forward browser console output to the terminal so agents can read
  // runtime errors and warnings without a browser devtools session.
  // (Moved out of `experimental` in Next 16 → top-level `logging`.)
  logging: {
    browserToTerminal: true,
  },

  experimental: {
    // Serves the built-in MCP server at /_next/mcp during `next dev`.
    // Coding agents can call get_routes, get_errors, get_logs,
    // get_page_metadata, and get_project_metadata via this endpoint.
    mcpServer: true,
  },

  // API paths (`/auth/*`, `/wallet`, …) and hreflang `/<locale>` prefixes are aliased
  // to the matching App Router pages — see src/config/uiRouteRedirects.ts.
  async redirects() {
    return UI_ROUTE_REDIRECTS;
  },

  // Security headers (CSP, HSTS, frame denial) — see src/config/securityHeaders.ts.
  // Override full policy with UI_CSP; report-only with UI_CSP_REPORT_ONLY=true.
  async headers() {
    const securityHeaders = buildUiSecurityHeaders();
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Only wrap with Sentry when a DSN is configured to avoid build-time errors
async function buildConfig() {
  const intlConfig = withNextIntl(nextConfig);

  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const { withSentryConfig } = await import("@sentry/nextjs");
    return withSentryConfig(intlConfig, {
      silent: true,
      telemetry: false,
      widenClientFileUpload: true,
      sourcemaps: { disable: true },
    });
  }

  return intlConfig;
}

export default buildConfig();
