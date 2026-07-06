import { expect, test } from "@playwright/test";
import {
  clearClientSession,
  E2E_PASSWORD,
  registerViaUi,
  uniqueEmail,
} from "./fixtures/auth";

// Full authenticated flows against the running stack (UI :3000 + API :1337 +
// Postgres + Redis). Each test provisions its own fresh account through the UI,
// so there is no shared fixture state to reset.

test.describe("authenticated flows", () => {
  test("register a new account and land on the dashboard", async ({ page }) => {
    await registerViaUi(page, uniqueEmail());
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });

  test("sign in through the login form", async ({ page }) => {
    const email = uniqueEmail();

    // Register (auto-logs in), then clear the stored session to force a fresh
    // login through the form.
    await registerViaUi(page, email);
    await clearClientSession(page);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });

  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(`nobody_${Date.now()}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("WrongPassword123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    // Stays on /login and shows an error toast; no redirect to the dashboard.
    await expect(page.getByText(/login failed|invalid|credentials/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });
});
