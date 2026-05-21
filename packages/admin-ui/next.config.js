/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_ZEROAUTH_URL: process.env.NEXT_PUBLIC_ZEROAUTH_URL || 'http://localhost:3000',
  },
  experimental: {
    serverComponentsExternalPackages: [],
  },
}

module.exports = nextConfig
