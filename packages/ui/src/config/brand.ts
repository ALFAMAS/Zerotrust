// All values read from NEXT_PUBLIC_* env vars with fallbacks.
// Copy packages/ui/.env.example and set these to rebrand the app.

export const brand = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "ZeroAuth",
  tagline: process.env.NEXT_PUBLIC_APP_TAGLINE ?? "Zero Trust Authentication for Modern Apps",
  description:
    process.env.NEXT_PUBLIC_APP_DESCRIPTION ??
    "Enterprise-grade authentication for modern applications. PASETO tokens, WebAuthn passkeys, MFA, RBAC, and more.",
  logoLetter: process.env.NEXT_PUBLIC_LOGO_LETTER ?? "Z",
  logoColor: process.env.NEXT_PUBLIC_LOGO_COLOR ?? "#6366f1", // used for inline style on the logo div
  color: process.env.NEXT_PUBLIC_BRAND_COLOR ?? "#6366f1", // primary brand color
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  apiUrl: process.env.NEXT_PUBLIC_ZEROAUTH_URL ?? "http://localhost:3000",
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/ALFAMAS/zeroauth",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  announcementBadge: process.env.NEXT_PUBLIC_ANNOUNCEMENT ?? "Now with OIDC provider + SAML 2.0",
  heroTitle: process.env.NEXT_PUBLIC_HERO_TITLE ?? "Zero Trust Authentication",
  heroSubtitle: process.env.NEXT_PUBLIC_HERO_SUBTITLE ?? "for Modern Apps",
  heroDescription:
    process.env.NEXT_PUBLIC_HERO_DESCRIPTION ??
    "Enterprise-grade auth without the enterprise complexity. PASETO tokens, WebAuthn passkeys, multi-factor auth, RBAC/ABAC, and real-time anomaly detection — all in one self-hosted platform.",
  copyrightYear: process.env.NEXT_PUBLIC_COPYRIGHT_YEAR ?? new Date().getFullYear().toString(),
  license: process.env.NEXT_PUBLIC_LICENSE ?? "MIT",
} as const;
