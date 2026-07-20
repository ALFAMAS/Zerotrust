import { expect, test } from "@playwright/test";
import { assertPageHealthy } from "./fixtures/pageHealth";
import { readAccessToken, registerViaUi, uniqueEmail, withStoredAuth } from "./fixtures/auth";
import { verifyUserEmail } from "./fixtures/db";
import { e2eAuthFile } from "./fixtures/paths";
import { E2E_API_URL } from "./fixtures/urls";

const USER_AUTH_FILE = e2eAuthFile("user");

test.describe("dashboard page smoke (real API)", () => {
  test.describe.configure({ mode: "serial" });

  let orgId = "";
  let authReady = false;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const email = uniqueEmail();

    await registerViaUi(page, email);
    const token = await readAccessToken(page);
    expect(token).toBeTruthy();

    const meRes = await page.request.get(`${E2E_API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.ok()).toBeTruthy();
    const me = (await meRes.json()) as { id: string };
    await verifyUserEmail(me.id);

    const orgRes = await page.request.post(`${E2E_API_URL}/orgs`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { name: "E2E Org", slug: `e2e-${Date.now()}` },
    });
    expect(orgRes.ok()).toBeTruthy();
    const orgBody = (await orgRes.json()) as { org: { id: string } };
    orgId = orgBody.org.id;

    await context.storageState({ path: USER_AUTH_FILE });
    await context.close();
    authReady = true;
  });

  const dashboardPages = [
    { path: "/dashboard", heading: /Welcome back/i },
    { path: "/dashboard/search", heading: "Search" },
    { path: "/dashboard/profile", heading: "Profile Settings" },
    { path: "/dashboard/security", heading: "Security Settings" },
    { path: "/dashboard/sessions", heading: "Active Sessions" },
    { path: "/dashboard/notifications", heading: "Notifications" },
    { path: "/dashboard/organizations", heading: "Organizations" },
    { path: "/dashboard/api-keys", heading: "API Keys" },
    { path: "/dashboard/webhooks", heading: "Webhooks" },
    { path: "/dashboard/billing", heading: "Billing" },
    { path: "/dashboard/wallet", heading: "Wallet" },
    { path: "/dashboard/jit", heading: "Cross-tenant access" },
    { path: "/dashboard/support", heading: "Support" },
    { path: "/dashboard/account", heading: "Account" },
  ];

  for (const pageCase of dashboardPages) {
    test(`loads ${pageCase.path}`, async ({ browser }) => {
      expect(authReady).toBe(true);
      await withStoredAuth(browser, USER_AUTH_FILE, async (page) => {
        await assertPageHealthy(page, pageCase);
      });
    });
  }

  test("loads organization detail and settings", async ({ browser }) => {
    expect(authReady).toBe(true);
    expect(orgId).toBeTruthy();
    await withStoredAuth(browser, USER_AUTH_FILE, async (page) => {
      await assertPageHealthy(page, {
        path: `/dashboard/organizations/${orgId}`,
        heading: "E2E Org",
      });
      await assertPageHealthy(page, {
        path: `/dashboard/organizations/${orgId}/settings`,
        heading: /E2E Org — Settings/,
      });
    });
  });
});
