import { expect, test } from "@playwright/test";

test.describe("security settings page", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("za_access_token", "test-token");
    });
  });

  test("shows MFA and passkey sections", async ({ page }) => {
    await page.route("http://localhost:1337/auth/me", (route) =>
      route.fulfill({
        json: {
          id: "user-1",
          email: "security@example.com",
          displayName: "Security User",
          mfa: { totp: { enabled: false } },
          passkeys: [],
          oauthProviders: [],
        },
      })
    );

    await page.goto("/dashboard/security");

    await expect(page.getByText("Security Settings")).toBeVisible();
    await expect(page.getByText("Authenticator App (TOTP)")).toBeVisible();
    await expect(page.getByText("Passkeys & Security Keys")).toBeVisible();
  });
});
