import type { PluginManifest } from "../../src/plugins/types.js";

export const manifest: PluginManifest = {
  id: "magic-link",
  name: "Magic Link",
  version: "1.0.0",
  description: "Passwordless email magic-link authentication (15-minute TTL).",
  apiRoutes: [
    { mountPath: "/auth/magic-link", description: "Send and verify magic links" },
  ],
  ui: {
    routes: [
      { path: "/magic-link", label: "Magic Link", group: "auth" },
      { path: "/magic-link/verify", label: "Verify Magic Link", group: "auth" },
    ],
    navItems: [{ href: "/magic-link", label: "Magic Link" }],
  },
};
