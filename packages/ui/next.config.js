const createNextIntlPlugin = require("next-intl/plugin");
const { withSentryConfig } = require("@sentry/nextjs");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_ZEROAUTH_URL: process.env.NEXT_PUBLIC_ZEROAUTH_URL || "http://localhost:3000",
  },
};

const withIntl = withNextIntl(nextConfig);

// Only wrap with Sentry when a DSN is configured to avoid build-time errors
module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(withIntl, {
      silent: true,
      telemetry: false,
      widenClientFileUpload: true,
      hideSourceMaps: true,
    })
  : withIntl;
