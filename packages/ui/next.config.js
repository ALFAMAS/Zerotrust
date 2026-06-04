const createNextIntlPlugin = require("next-intl/plugin");
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_ZEROAUTH_URL: process.env.NEXT_PUBLIC_ZEROAUTH_URL || "http://localhost:3000",
  },
};

module.exports = withNextIntl(nextConfig);
