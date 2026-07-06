import { expect, test } from "@playwright/test";
import { mockAuthenticatedShell } from "./fixtures/apiMocks";

test.describe("security settings page", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedShell(page, {
      id: "user-1",
      email: "security@example.com",
      displayName: "Security User",
      mfa: { totp: { enabled: false } },
      passkeys: [],
      oauthProviders: [],
    });
  });

  test("shows MFA and passkey sections", async ({ page }) => {
    await page.goto("/dashboard/security");

    await expect(page.getByText("Security Settings")).toBeVisible();
    await expect(page.getByText("Authenticator App (TOTP)")).toBeVisible();
    await expect(page.getByText("Passkeys & Security Keys")).toBeVisible();
  });
});
