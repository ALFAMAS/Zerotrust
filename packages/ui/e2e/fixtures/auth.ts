import { expect, type Browser, type Page } from "@playwright/test";

export function uniqueEmail(): string {
  return `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
}

// Strong + effectively-random so the live HIBP breach check (if enabled) won't
// reject it; the webServer also runs with HIBP_CHECK_ENABLED=false.
export const E2E_PASSWORD = `E2e!${Date.now()}aB9x#Qz`;

/** Dismiss the cookie banner when it blocks interactions. */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const accept = page.getByRole("button", { name: "Accept All" });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
}

/**
 * Seed a mock access token the way the app reads it today (ADR 008 cookie mirror).
 * Legacy localStorage-only seeding no longer authenticates dashboard routes.
 */
export async function seedMockAuth(page: Page, token = "test-token"): Promise<void> {
  await page.addInitScript((accessToken: string) => {
    document.cookie = `za_access_token=${encodeURIComponent(accessToken)};path=/;max-age=3600;samesite=lax`;
  }, token);
}

export async function registerViaUi(page: Page, email: string): Promise<void> {
  await page.goto("/register");
  await dismissCookieBanner(page);
  await page.getByLabel("Display Name").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("Confirm Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** Clear session so a fresh login can be exercised (cookie + legacy storage). */
export async function clearClientSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.cookie = "za_access_token=;path=/;max-age=0;samesite=lax";
    localStorage.clear();
  });
  // Reload so in-memory token from the auth module is dropped.
  await page.goto("/login");
  await dismissCookieBanner(page);
}

export async function readAccessToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const prefix = "za_access_token=";
    for (const part of document.cookie.split(";")) {
      const trimmed = part.trim();
      if (!trimmed.startsWith(prefix)) continue;
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return null;
      }
    }
    return null;
  });
}

/** Run a test callback with a saved Playwright storage state (cookie session). */
export async function withStoredAuth(
  browser: Browser,
  storagePath: string,
  fn: (page: Page) => Promise<void>
): Promise<void> {
  const context = await browser.newContext({ storageState: storagePath });
  const page = await context.newPage();
  try {
    await fn(page);
  } finally {
    await context.close();
  }
}
