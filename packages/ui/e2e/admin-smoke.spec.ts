import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { assertPageHealthy } from "./fixtures/pageHealth";
import { readAccessToken, registerViaUi, uniqueEmail, withStoredAuth } from "./fixtures/auth";
import { grantAdminRole, verifyUserEmail } from "./fixtures/db";
import { E2E_API_URL } from "./fixtures/urls";

const ADMIN_AUTH_FILE = "e2e/.auth/admin.json";

test.describe("admin page smoke (real API)", () => {
  test.describe.configure({ mode: "serial" });

  let userId: string;
  let authReady = false;

  test.beforeAll(async ({ browser }) => {
    mkdirSync("e2e/.auth", { recursive: true });
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
    userId = me.id;

    await verifyUserEmail(userId);
    await grantAdminRole(userId);

    await context.storageState({ path: ADMIN_AUTH_FILE });
    await context.close();
    authReady = true;
  });

  const adminPages = [
    { path: "/admin", heading: "Dashboard" },
    { path: "/admin/users", heading: "Users" },
    { path: "/admin/roles", heading: "System roles" },
    { path: "/admin/revenue", heading: "Revenue" },
    { path: "/admin/sessions", heading: "Sessions" },
    { path: "/admin/feedback", heading: "Feedback inbox" },
    { path: "/admin/anomaly", heading: "Anomaly Detection" },
    { path: "/admin/settings/auth", heading: "Auth Settings" },
    { path: "/admin/jit", heading: "Cross-tenant access requests" },
    { path: "/admin/jit-grants", heading: "JIT privilege grants" },
    { path: "/admin/regions", heading: /Branding.*Domains/ },
    { path: "/admin/search", heading: "Search index" },
    { path: "/admin/content", heading: "Content tools" },
    { path: "/admin/webhooks", heading: "Webhook delivery log" },
    { path: "/admin/compliance", heading: "Compliance" },
    { path: "/admin/alerts", heading: "Alert Channels" },
    { path: "/admin/settings/general", heading: "General Settings" },
    { path: "/admin/access-reviews", heading: "Access Reviews" },
    { path: "/admin/audit", heading: "Audit Logs" },
  ];

  for (const pageCase of adminPages) {
    test(`loads ${pageCase.path}`, async ({ browser }) => {
      expect(authReady).toBe(true);
      await withStoredAuth(browser, ADMIN_AUTH_FILE, async (page) => {
        await assertPageHealthy(page, pageCase);
      });
    });
  }

  test("loads admin user detail", async ({ browser }) => {
    expect(authReady).toBe(true);
    await withStoredAuth(browser, ADMIN_AUTH_FILE, async (page) => {
      await assertPageHealthy(page, {
        path: `/admin/users/${userId}`,
        heading: "User Detail",
      });
    });
  });

  test("/admin/tenants redirects to organizations", async ({ browser }) => {
    expect(authReady).toBe(true);
    await withStoredAuth(browser, ADMIN_AUTH_FILE, async (page) => {
      await page.goto("/admin/tenants");
      await expect(page).toHaveURL(/\/dashboard\/organizations/, { timeout: 15_000 });
    });
  });
});
