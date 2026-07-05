import type { Page } from "@playwright/test";
import { seedMockAuth } from "./auth";

export type MockUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerified?: boolean;
  avatarUrl?: string | null;
  mfa?: { totp?: { enabled: boolean } };
  passkeys?: { credentialId: string; name: string; createdAt: string }[];
  oauthProviders?: string[];
  roles?: string[];
};

const DEFAULT_USER: MockUser = {
  id: "user-mock",
  email: "mock@example.com",
  displayName: "Mock User",
  emailVerified: true,
  mfa: { totp: { enabled: false } },
  passkeys: [],
  oauthProviders: [],
  roles: ["user"],
};

/** Mock the authenticated dashboard shell (auth/me, sessions, notifications). */
export async function mockAuthenticatedShell(
  page: Page,
  user: MockUser = DEFAULT_USER,
  token = "test-token"
): Promise<void> {
  await seedMockAuth(page, token);

  await page.route("http://localhost:1337/auth/me", (route) => route.fulfill({ json: user }));
  await page.route("http://localhost:1337/sessions", (route) =>
    route.fulfill({
      json: {
        sessions: [{ id: "session-1", isActive: true, userAgent: "Playwright", createdAt: new Date().toISOString() }],
      },
    })
  );
  await page.route("http://localhost:1337/notifications/unread-count", (route) =>
    route.fulfill({ json: { count: 0 } })
  );
  // SSE uses fetch streaming — abort so tests don't hang on live connections.
  await page.route("http://localhost:1337/notifications/sse", (route) => route.abort());
  await page.route("http://localhost:1337/notifications", (route) =>
    route.fulfill({ json: { data: [], pagination: { total: 0 } } })
  );
  await page.route("http://localhost:1337/notifications/preferences", (route) =>
    route.fulfill({
      json: {
        emailFallback: true,
        emailFallbackDays: 3,
        security: true,
        billing: true,
        account: true,
        social: true,
        system: true,
      },
    })
  );
}
