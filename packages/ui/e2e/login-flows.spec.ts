import { expect, test } from "@playwright/test";
import { dismissCookieBanner } from "./fixtures/auth";
import { mockLoginMfaFlow, mockOAuthExchange } from "./fixtures/apiMocks";

test.describe("login edge flows (mocked API)", () => {
  test("password login shows MFA step and completes", async ({ page }) => {
    await mockLoginMfaFlow(page);

    await page.goto("/login");
    await dismissCookieBanner(page);
    await page.getByLabel("Email").fill("mfa@example.com");
    await page.getByLabel("Password", { exact: true }).fill("AnyPass123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: /two-factor authentication/i })
    ).toBeVisible();
    await page.getByLabel("Authentication code").fill("123456");
    await page.getByRole("button", { name: /^verify$/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  });

  test("OAuth exchange code on login redirects to dashboard", async ({ page }) => {
    await mockOAuthExchange(page);

    await page.goto("/login?oauth_code=e2e-exchange-code");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  });

  test("login honors safe ?next= redirect", async ({ page }) => {
    await page.route("http://localhost:1337/auth/login", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        json: { accessToken: "next-flow-token", refreshToken: "next-flow-refresh" },
      });
    });

    await page.goto("/login?next=/dashboard/profile");
    await dismissCookieBanner(page);
    await page.getByLabel("Email").fill("next@example.com");
    await page.getByLabel("Password", { exact: true }).fill("AnyPass123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard\/profile/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Profile Settings", level: 1 })).toBeVisible();
  });
});
