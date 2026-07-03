import { SUPPORTED_LOCALES } from "../i18n/locales";

/** Next.js redirect rule for UI route aliases. */
export type UiRedirect = {
  source: string;
  destination: string;
  permanent: boolean;
};

/**
 * Maps API-style `/auth/*` paths (Hono backend on :1337) to Next.js `(auth)/*` pages.
 * The UI login page lives at `/login`, not `/auth/login`.
 */
export const AUTH_UI_REDIRECTS: UiRedirect[] = [
  { source: "/auth/login", destination: "/login", permanent: false },
  { source: "/auth/login/mfa", destination: "/login", permanent: false },
  { source: "/auth/register", destination: "/register", permanent: false },
  { source: "/auth/password-reset", destination: "/forgot-password", permanent: false },
  { source: "/auth/magic-link", destination: "/magic-link", permanent: false },
  { source: "/auth/magic-link/verify", destination: "/magic-link/verify", permanent: false },
  { source: "/auth/verify-email", destination: "/verify-email", permanent: false },
];

/** Canonical sign-in page path in the Next.js app (not the API POST endpoint). */
export const LOGIN_PAGE_PATH = "/login";

/** API top-level paths that share a name with dashboard pages but live under `/dashboard/*` in the UI. */
const DASHBOARD_API_ALIASES: ReadonlyArray<{ apiBase: string; uiBase: string; preserveSubpath?: boolean }> =
  [
    { apiBase: "/wallet", uiBase: "/dashboard/wallet" },
    { apiBase: "/billing", uiBase: "/dashboard/billing" },
    { apiBase: "/sessions", uiBase: "/dashboard/sessions" },
    { apiBase: "/notifications", uiBase: "/dashboard/notifications" },
    { apiBase: "/api-keys", uiBase: "/dashboard/api-keys" },
    { apiBase: "/webhooks", uiBase: "/dashboard/webhooks" },
    { apiBase: "/support", uiBase: "/dashboard/support" },
    { apiBase: "/search", uiBase: "/dashboard/search" },
    { apiBase: "/orgs", uiBase: "/dashboard/organizations", preserveSubpath: true },
    { apiBase: "/jit/cross-tenant", uiBase: "/dashboard/jit" },
    // Common shortcuts — no matching API page, but users expect these URLs.
    { apiBase: "/profile", uiBase: "/dashboard/profile" },
    { apiBase: "/settings", uiBase: "/dashboard/settings" },
    { apiBase: "/security", uiBase: "/dashboard/security" },
    { apiBase: "/account", uiBase: "/dashboard/account" },
  ];

function dashboardAliasRedirects(): UiRedirect[] {
  const rules: UiRedirect[] = [];
  for (const { apiBase, uiBase, preserveSubpath } of DASHBOARD_API_ALIASES) {
    rules.push({ source: apiBase, destination: uiBase, permanent: false });
    if (preserveSubpath) {
      rules.push({
        source: `${apiBase}/:path*`,
        destination: `${uiBase}/:path*`,
        permanent: false,
      });
    } else {
      rules.push({ source: `${apiBase}/:path*`, destination: uiBase, permanent: false });
    }
  }
  return rules;
}

/**
 * hreflang alternates in layout metadata use `/<locale>` paths, but locale is
 * cookie-based (next-intl) — there is no `/[locale]` App Router segment.
 */
function localePrefixRedirects(): UiRedirect[] {
  const localePattern = SUPPORTED_LOCALES.join("|");
  return [
    { source: `/:locale(${localePattern})`, destination: "/", permanent: false },
    {
      source: `/:locale(${localePattern})/:path*`,
      destination: "/:path*",
      permanent: false,
    },
  ];
}

/** All Next.js redirects: auth aliases, dashboard API aliases, locale prefix stripping. */
export const UI_ROUTE_REDIRECTS: UiRedirect[] = [
  ...AUTH_UI_REDIRECTS,
  ...dashboardAliasRedirects(),
  ...localePrefixRedirects(),
];
