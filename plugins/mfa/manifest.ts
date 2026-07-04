import type { PluginManifest } from "../../src/plugins/types.js";

export const manifest: PluginManifest = {
  id: "mfa",
  name: "Multi-Factor Authentication",
  version: "1.0.0",
  description: "TOTP and email OTP second-factor authentication.",
  apiRoutes: [{ mountPath: "/auth/mfa", description: "TOTP setup/verify and email OTP" }],
  env: [
    { key: "TOTP_WINDOW", description: "TOTP clock skew window (default 1)" },
    { key: "OTP_EXPIRY_SECS", description: "Email OTP TTL in seconds (default 900)" },
    { key: "MFA_EMAIL_ENABLED", description: "Set to false to disable email OTP channel" },
  ],
  ui: {
    routes: [{ path: "/settings/security", label: "MFA Settings", group: "dashboard" }],
  },
};
