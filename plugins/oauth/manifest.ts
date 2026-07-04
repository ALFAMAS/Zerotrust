import type { PluginManifest } from "../../src/plugins/types.js";

export const manifest: PluginManifest = {
  id: "oauth",
  name: "OAuth Social Login",
  version: "1.0.0",
  description: "Google, GitHub, and Facebook OAuth social login and account linking.",
  apiRoutes: [
    { mountPath: "/auth/oauth/:provider/authorize", description: "Start OAuth flow" },
    { mountPath: "/auth/oauth/:provider/callback", description: "OAuth callback" },
    { mountPath: "/auth/oauth/exchange", description: "Redeem short-lived exchange code" },
    { mountPath: "/auth/oauth/:provider", description: "Unlink OAuth provider (DELETE)" },
    { mountPath: "/auth/me/link", description: "Link OAuth identity to signed-in account" },
  ],
  env: [
    { key: "OAUTH_GOOGLE_CLIENT_ID", description: "Google OAuth client ID" },
    { key: "OAUTH_GOOGLE_CLIENT_SECRET", required: true, description: "Google OAuth secret" },
    { key: "OAUTH_GITHUB_CLIENT_ID", description: "GitHub OAuth client ID" },
    { key: "OAUTH_GITHUB_CLIENT_SECRET", description: "GitHub OAuth client secret" },
    { key: "OAUTH_FACEBOOK_CLIENT_ID", description: "Facebook OAuth client ID" },
    { key: "OAUTH_FACEBOOK_CLIENT_SECRET", description: "Facebook OAuth client secret" },
  ],
  ui: {
    routes: [{ path: "/login", label: "OAuth buttons on login", group: "auth" }],
  },
};
