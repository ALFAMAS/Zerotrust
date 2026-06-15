import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_ZEROAUTH_URL: process.env.NEXT_PUBLIC_ZEROAUTH_URL ?? "http://localhost:3000",
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
