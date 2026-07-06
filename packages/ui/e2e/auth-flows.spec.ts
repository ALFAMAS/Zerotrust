import { expect, test } from "@playwright/test";
import {
  clearClientSession,
  dismissCookieBanner,
  E2E_PASSWORD,
  loginViaUi,
  registerAndGetUserId,
  uniqueEmail,
} from "./fixtures/auth";
import {
  getEmailVerificationCode,
  getUserIdByEmail,
  seedMagicLinkToken,
  seedPasswordResetCode,
} from "./fixtures/db";

const NEW_PASSWORD = `E2e!New${Date.now()}x#Qz`;

test.describe("auth recovery flows (real API)", () => {
  test("forgot-password shows confirmation", async ({ page }) => {
    const email = uniqueEmail();
    await registerAndGetUserId(page, email);
    await clearClientSession(page);

    await page.goto("/forgot-password");
    await dismissCookieBanner(page);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: /send reset link/i }).click();

    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
  });

  test("reset password with seeded code and sign in with new password", async ({ page }) => {
    const email = uniqueEmail();
    await registerAndGetUserId(page, email);
    await clearClientSession(page);

    const resetCode = "123456";
    await seedPasswordResetCode(email, resetCode);

    await page.goto("/reset-password");
    await dismissCookieBanner(page);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Reset code").fill(resetCode);
    await page.getByLabel("New Password").fill(NEW_PASSWORD);
    await page.getByLabel("Confirm Password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: /update password/i }).click();

    await expect(page.getByRole("heading", { name: /password updated/i })).toBeVisible();
    await loginViaUi(page, email, NEW_PASSWORD);
  });

  test("verify email with code from database", async ({ page }) => {
    const { email, userId } = await registerAndGetUserId(page);
    const code = await getEmailVerificationCode(userId);

    await page.goto("/verify-email");
    await dismissCookieBanner(page);
    await page.getByLabel("Verification code").fill(code);
    await page.getByRole("button", { name: /verify email/i }).click();

    await expect(page.getByRole("heading", { name: /email verified/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    const verified = await getUserIdByEmail(email);
    expect(verified).toBeTruthy();
  });

  test("magic link send UI shows confirmation", async ({ page }) => {
    const email = uniqueEmail();
    await registerAndGetUserId(page, email);
    await clearClientSession(page);

    await page.goto("/magic-link");
    await dismissCookieBanner(page);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: /send magic link/i }).click();
    await expect(page.getByRole("heading", { name: /check your inbox/i })).toBeVisible();
  });

  test("magic link verify with seeded token", async ({ page }) => {
    const email = uniqueEmail();
    await registerAndGetUserId(page, email);
    await clearClientSession(page);

    const rawToken = "b".repeat(64);
    await seedMagicLinkToken(email.toLowerCase(), rawToken);

    await page.goto(
      `/magic-link/verify?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email.toLowerCase())}`
    );
    await dismissCookieBanner(page);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });
  });
});
