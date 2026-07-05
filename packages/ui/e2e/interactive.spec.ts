import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { dismissCookieBanner, openCommandPalette, readAccessToken, registerViaUi, uniqueEmail, withStoredAuth } from "./fixtures/auth";
import { verifyUserEmail } from "./fixtures/db";

const INTERACTIVE_AUTH_FILE = "e2e/.auth/interactive.json";

test.describe("interactive dashboard flows (real API)", () => {
  test.describe.configure({ mode: "serial" });

  let orgId = "";
  let authReady = false;

  test.beforeAll(async ({ browser }) => {
    mkdirSync("e2e/.auth", { recursive: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const email = uniqueEmail();

    await registerViaUi(page, email);
    const token = await readAccessToken(page);
    expect(token).toBeTruthy();

    const meRes = await page.request.get("http://localhost:1337/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const me = (await meRes.json()) as { id: string };
    await verifyUserEmail(me.id);

    const orgRes = await page.request.post("http://localhost:1337/orgs", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { name: "Interactive Org", slug: `interactive-${Date.now()}` },
    });
    const orgBody = (await orgRes.json()) as { org: { id: string } };
    orgId = orgBody.org.id;

    await context.storageState({ path: INTERACTIVE_AUTH_FILE });
    await context.close();
    authReady = true;
  });

  test("command palette navigates to profile", async ({ browser }) => {
    expect(authReady).toBe(true);
    await withStoredAuth(browser, INTERACTIVE_AUTH_FILE, async (page) => {
      await page.goto("/dashboard");
      await dismissCookieBanner(page);
      await openCommandPalette(page);
      const paletteSearch = page
        .getByRole("dialog", { name: "Command palette" })
        .getByRole("searchbox", { name: "Search" });
      await paletteSearch.fill("profile");
      await page.getByRole("option", { name: /^Profile/i }).click();
      await expect(page).toHaveURL(/\/dashboard\/profile/);
    });
  });

  test("search page accepts a query", async ({ browser }) => {
    await withStoredAuth(browser, INTERACTIVE_AUTH_FILE, async (page) => {
      await page.goto("/dashboard/search");
      await page.getByLabel("Search query").fill("test");
      await expect(page.getByRole("heading", { name: "Search", level: 1 })).toBeVisible();
    });
  });

  test("creates an API key", async ({ browser }) => {
    await withStoredAuth(browser, INTERACTIVE_AUTH_FILE, async (page) => {
      await page.goto("/dashboard/api-keys");
      await page.getByPlaceholder(/key name/i).fill("E2E Key");
      await page.getByRole("button", { name: /create key/i }).click();
      await expect(page.getByText(/api key created/i)).toBeVisible({ timeout: 20_000 });
    });
  });

  test("creates a webhook endpoint", async ({ browser }) => {
    await withStoredAuth(browser, INTERACTIVE_AUTH_FILE, async (page) => {
      await page.goto("/dashboard/webhooks");
      await page.getByRole("button", { name: /add endpoint/i }).click();
      await page.getByLabel("Endpoint URL").fill("https://example.com/webhooks/e2e");
      await page.getByLabel("Signing secret").fill("e2e-webhook-secret-32chars-min!!");
      await page.getByLabel("auth.login.success").check();
      await page.getByRole("button", { name: /create endpoint/i }).click();
      await expect(page.getByText("https://example.com/webhooks/e2e")).toBeVisible({
        timeout: 20_000,
      });
    });
  });

  test("submits a JIT access request", async ({ browser }) => {
    expect(orgId).toBeTruthy();
    await withStoredAuth(browser, INTERACTIVE_AUTH_FILE, async (page) => {
      await page.goto("/dashboard/jit");
      await page.locator("#page-f0").fill(orgId);
      await page.locator("#page-f1").fill("billing:read");
      await page.locator("#page-f2").fill("E2E cross-tenant access test");
      await page.getByRole("button", { name: /request access/i }).click();
      await expect(page.getByText(/submitted for approval/i)).toBeVisible({ timeout: 20_000 });
    });
  });

  test("sessions page lists active session", async ({ browser }) => {
    await withStoredAuth(browser, INTERACTIVE_AUTH_FILE, async (page) => {
      await page.goto("/dashboard/sessions");
      await expect(page.getByRole("heading", { name: "Active Sessions", level: 1 })).toBeVisible();
      await expect(page.getByText("This device")).toBeVisible({ timeout: 20_000 });
    });
  });

  test("profile display name can be updated", async ({ browser }) => {
    await withStoredAuth(browser, INTERACTIVE_AUTH_FILE, async (page) => {
      await page.goto("/dashboard/profile");
      const nameInput = page.getByLabel(/display name/i);
      await nameInput.fill("E2E Updated Name");
      await page.getByRole("button", { name: /save changes/i }).click();
      await expect(page.getByText(/profile updated successfully/i)).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  test("account page triggers GDPR export download", async ({ browser }) => {
    await withStoredAuth(browser, INTERACTIVE_AUTH_FILE, async (page) => {
      await page.goto("/dashboard/account");
      const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
      await page.getByRole("button", { name: /download my data/i }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.json$/);
    });
  });
});
