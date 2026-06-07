export interface ChangelogEntry {
  version: string;
  date: string;
  sections: {
    type: "added" | "changed" | "fixed" | "security" | "removed";
    items: string[];
  }[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: "1.4.0",
    date: "2026-06-01",
    sections: [
      {
        type: "added",
        items: [
          "Analytics integration — Plausible and Google Analytics 4 with GDPR-compliant consent gate",
          "Avatar upload — JPEG/PNG/GIF/WebP, max 5 MB, served from local uploads directory",
          "Unsubscribe tokens — HMAC-signed one-click unsubscribe links in notification emails (CAN-SPAM)",
          "Custom org roles — per-org role definitions with fine-grained permission sets",
          "In-app NPS / thumbs feedback widget with 7-day dismissal",
          "Blog and changelog pages",
          "Sentry error monitoring — client-side error boundaries + optional server-side capture",
        ],
      },
      {
        type: "changed",
        items: [
          "Cookie consent banner now dispatches za:consent-change event for same-page sync",
          "Profile page redesigned with avatar preview, username, and phone fields",
          "Notification emails include per-user unsubscribe links",
        ],
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-05-15",
    sections: [
      {
        type: "added",
        items: [
          "Notification preferences — GET/PUT /notifications/preferences per user",
          "Email fallback scheduler — digest email to inactive users with unread notifications",
          "One-click deploy buttons for Railway and Render",
          "GDPR data export and 30-day soft-delete with grace period",
          "Data retention scheduler — auto-purge audit logs, sessions, OTPs",
          "BullMQ email queue — non-blocking transactional email delivery",
          "i18n foundation — next-intl with English messages, NextIntlClientProvider",
        ],
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-04-20",
    sections: [
      {
        type: "added",
        items: [
          "Organizations & teams — workspaces, invite by email, role management",
          "Transfer ownership with confirmation flow",
          "Real-time notifications via Server-Sent Events",
          "Per-tenant branding via NEXT_PUBLIC_* env vars",
          "Cookie consent banner (GDPR-compliant)",
          "Privacy policy and Terms of Service pages",
        ],
      },
      {
        type: "security",
        items: [
          "Impossible-travel and brute-force anomaly detection",
          "JIT access grants with approval flow",
          "Passkey (WebAuthn) registration and authentication",
        ],
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-03-10",
    sections: [
      {
        type: "added",
        items: [
          "RBAC and ABAC authorization engine",
          "Magic-link passwordless login",
          "TOTP and SMS multi-factor authentication",
          "Session management with max-device enforcement",
          "Geo-fencing and temporal-access middleware",
          "OpenTelemetry distributed tracing",
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-02-01",
    sections: [
      {
        type: "added",
        items: [
          "Initial release — PASETO v4 tokens, password auth, refresh tokens",
          "OAuth 2.0 social login (Google, GitHub, Discord)",
          "Admin dashboard — user management, audit logs, settings",
          "Docker production build with multi-stage Dockerfile",
          "GitHub Actions CI — lint, type-check, test, build",
        ],
      },
    ],
  },
];
