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
  onboarding?: {
    hasOrg: boolean;
    hasSentInvite: boolean;
    hasMfa: boolean;
    hasApiKey: boolean;
    completedAt?: string | null;
  };
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

/** Mock billing endpoints for the billing page. */
export async function mockBillingApis(page: Page): Promise<void> {
  await page.route("http://localhost:1337/billing/subscription", (route) =>
    route.fulfill({
      json: {
        plan: "free",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
    })
  );
  await page.route("http://localhost:1337/billing/usage", (route) =>
    route.fulfill({
      json: {
        apiKeys: { used: 1, limit: 2 },
        orgMembers: { used: 1, limit: 5 },
        webhooks: { used: 0, limit: 3 },
      },
    })
  );
  await page.route("http://localhost:1337/billing/currencies", (route) =>
    route.fulfill({ json: { currencies: ["USD", "EUR"] } })
  );
  await page.route("http://localhost:1337/billing/pricing*", (route) =>
    route.fulfill({
      json: {
        plans: [
          { plan: "pro", formatted: "$29", pppDiscountPercent: 0 },
          { plan: "enterprise", formatted: "Custom", pppDiscountPercent: 0 },
        ],
      },
    })
  );
}

/** Admin shell: authenticated user with system admin role. */
export async function mockAdminShell(
  page: Page,
  user: MockUser = { ...DEFAULT_USER, id: "admin-mock", roles: ["user", "admin"] }
): Promise<void> {
  await mockAuthenticatedShell(page, user);
}

/** Mock login → MFA challenge → MFA verify for the login page. */
export async function mockLoginMfaFlow(page: Page, token = "mfa-session-token"): Promise<void> {
  await page.route("http://localhost:1337/auth/login", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { mfaRequired: true, mfaToken: "mfa-tok-e2e" } });
  });
  await page.route("http://localhost:1337/auth/login/mfa", async (route) => {
    await route.fulfill({
      json: { accessToken: token, refreshToken: "refresh-mfa-e2e" },
    });
  });
}

/** Mock OAuth exchange-code redemption on the login page. */
export async function mockOAuthExchange(
  page: Page,
  token = "oauth-access-token"
): Promise<void> {
  await page.route("http://localhost:1337/auth/oauth/exchange", async (route) => {
    await route.fulfill({
      json: { accessToken: token, refreshToken: "oauth-refresh-e2e" },
    });
  });
}
