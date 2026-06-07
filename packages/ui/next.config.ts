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
