import { expect, type Browser, type Page } from "@playwright/test";
import { E2E_API_URL } from "./urls";

export function uniqueEmail(): string {
  return `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
}

// Strong + effectively-random so the live HIBP breach check (if enabled) won't
// reject it; the webServer also runs with HIBP_CHECK_ENABLED=false.
export const E2E_PASSWORD = `E2e!${Date.now()}aB9x#Qz`;

/** Dismiss the cookie banner when it blocks interactions. */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const accept = page.getByRole("button", { name: "Accept All" });
  const mounted = await accept
    .waitFor({ state: "attached", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!mounted) return;
  await accept.evaluate((button) => (button as HTMLElement).click());
}

/** Open the dashboard command palette after the app shell has mounted. */
export async function openCommandPalette(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: "Open command palette" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
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

export async function loginViaUi(
  page: Page,
  email: string,
  password = E2E_PASSWORD
): Promise<void> {
  await page.goto("/login");
  await dismissCookieBanner(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

export async function registerAndGetUserId(page: Page, email = uniqueEmail()): Promise<{
  email: string;
  userId: string;
  token: string;
}> {
  await registerViaUi(page, email);
  const token = await readAccessToken(page);
  if (!token) throw new Error("Missing access token after registration");
  const meRes = await page.request.get(`${E2E_API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meRes.ok()) throw new Error(`auth/me failed: ${meRes.status()}`);
  const me = (await meRes.json()) as { id: string };
  return { email, userId: me.id, token };
}

export async function registerViaUi(page: Page, email: string): Promise<void> {
  await page.goto("/register");
  await dismissCookieBanner(page);
  await page.getByLabel("Display Name").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("Confirm Password").fill(E2E_PASSWORD);

  const registerResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/auth/register"
  );
  const loginResponse = registerResponse.then((registration) =>
    registration.ok()
      ? page.waitForResponse((response) => new URL(response.url()).pathname === "/auth/login")
      : null
  );
  await page.getByRole("button", { name: /create account/i }).click();

  const registration = await registerResponse;
  if (!registration.ok()) {
    const body = (await registration.json().catch(() => null)) as { message?: string } | null;
    throw new Error(
      `Registration failed (${registration.status()}): ${body?.message ?? "unknown error"}`
    );
  }

  const login = await loginResponse;
  if (!login) throw new Error("Post-registration login did not start");
  if (!login.ok()) {
    const body = (await login.json().catch(() => null)) as { message?: string } | null;
    throw new Error(
      `Post-registration login failed (${login.status()}): ${body?.message ?? "unknown error"}`
    );
  }

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
