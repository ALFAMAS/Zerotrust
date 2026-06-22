import { expect, test } from "@playwright/test";

const completeUser = {
  id: "user-complete",
  email: "complete@example.com",
  emailVerified: true,
  displayName: "Complete User",
  avatarUrl: "https://example.com/avatar.png",
  mfa: { totp: { enabled: true } },
  passkeys: [{ credentialId: "passkey-1", name: "Laptop", createdAt: new Date().toISOString() }],
  oauthProviders: [],
};

test.describe("dashboard polish", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("za_access_token", "test-token");
    });
  });

  test("shows setup, profile, and usage progress", async ({ page }) => {
    await page.route("http://localhost:1337/auth/me", (route) =>
      route.fulfill({ json: completeUser })
    );
    await page.route("http://localhost:1337/sessions", (route) =>
      route.fulfill({
        json: {
          sessions: [{ id: "session-1", isActive: true }],
        },
      })
    );

    await page.goto("/dashboard");

    await expect(page.getByText("Setup progress")).toBeVisible();
    await expect(page.getByText("Profile strength")).toBeVisible();
    await expect(page.getByText("Usage readiness")).toBeVisible();
    await expect(page.getByText("4/4")).toBeVisible();
  });

  test("records onboarding completion once when setup reaches 100 percent", async ({ page }) => {
    await page.route("http://localhost:1337/auth/me", (route) =>
      route.fulfill({ json: completeUser })
    );
    await page.route("http://localhost:1337/sessions", (route) =>
      route.fulfill({ json: { sessions: [{ id: "session-1", isActive: true }] } })
    );

    await page.goto("/dashboard");

    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("za_onboarding_completed")))
      .toBe("1");
    await expect(page.getByText("Onboarding complete")).toBeVisible();
  });
});
