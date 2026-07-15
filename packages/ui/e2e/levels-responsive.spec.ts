import { expect, test } from "@playwright/test";
import { mockAdminShell, mockAuthenticatedShell, mockBillingApis } from "./fixtures/apiMocks";
import { E2E_API_URL } from "./fixtures/urls";

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const styles = getComputedStyle(element);
        return element.scrollWidth > element.clientWidth + 1 && styles.overflowX === "visible";
      })
      .slice(0, 8)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        text: element.textContent?.trim().slice(0, 80),
      }));
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      offenders,
    };
  });
  expect(metrics.scrollWidth, JSON.stringify(metrics, null, 2)).toBeLessThanOrEqual(
    metrics.clientWidth + 1
  );
}

const PUBLIC_AND_AUTH_REPRESENTATIVES = [
  { name: "landing", path: "/" },
  { name: "help", path: "/help" },
  { name: "status", path: "/status" },
  { name: "legal", path: "/privacy" },
  { name: "invite", path: "/invite/invalid-levels-token" },
  { name: "login", path: "/login" },
  { name: "register", path: "/register" },
  { name: "password recovery", path: "/forgot-password" },
  { name: "magic-link verification", path: "/magic-link/verify" },
] as const;

async function setStoredTheme(page: import("@playwright/test").Page, theme: "light" | "dark") {
  await page.evaluate((nextTheme) => localStorage.setItem("theme", nextTheme), theme);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(new RegExp(theme));
}

async function expectKeyboardFocus(page: import("@playwright/test").Page) {
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Tab");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName ?? "BODY"))
    .not.toBe("BODY");
}

async function expectResponsiveRepresentative(
  page: import("@playwright/test").Page,
  path: string
) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(path);

  const pageHeading = page.getByRole("heading", { level: 1 });
  await expect(pageHeading).toHaveCount(1);
  await expect(pageHeading).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/light/);
  const lightBackground = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).backgroundColor);
  await expectKeyboardFocus(page);

  await setStoredTheme(page, "dark");
  const darkBackground = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).backgroundColor);
  expect(darkBackground).not.toBe(lightBackground);

  await page.setViewportSize({ width: 320, height: 800 });
  await setStoredTheme(page, "light");
  await expectNoPageOverflow(page);
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });
  await expectNoPageOverflow(page);

  await pageHeading.evaluate((heading) => {
    heading.textContent = "A deliberately long localized application heading ".repeat(6);
  });
  await expectNoPageOverflow(page);

  await page.setViewportSize({ width: 640, height: 900 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expectNoPageOverflow(page);
}

test.describe("Levels rendered matrix", () => {
  test("landing reflows at 320px and switches to the complete dark theme", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expectNoPageOverflow(page);

    const themeToggle = page.getByRole("button", { name: "Switch to dark mode" });
    await themeToggle.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  });

  for (const representative of PUBLIC_AND_AUTH_REPRESENTATIVES) {
    test(`${representative.name} covers themes, reflow, zoom, keyboard, motion, long text, and RTL`, async ({
      page,
    }) => {
      await page.addInitScript(() => localStorage.setItem("za_cookie_consent", "accepted"));
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(representative.path);

      const pageHeading = page.getByRole("heading", { level: 1 });
      await expect(pageHeading).toHaveCount(1);
      await expect(pageHeading).toBeVisible();
      await expect(page.locator("html")).toHaveClass(/light/);
      const lightBackground = await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
      await expectKeyboardFocus(page);

      await setStoredTheme(page, "dark");
      const darkBackground = await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
      expect(darkBackground).not.toBe(lightBackground);

      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: 320, height: 800 });
      await setStoredTheme(page, "light");
      await expectNoPageOverflow(page);

      await page.evaluate(() => {
        document.documentElement.dir = "rtl";
      });
      await expectNoPageOverflow(page);

      await pageHeading.evaluate((heading) => {
        heading.textContent = "A deliberately long localized page heading ".repeat(6);
      });
      await expectNoPageOverflow(page);

      await page.setViewportSize({ width: 640, height: 900 });
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await expectNoPageOverflow(page);

      const animated = page.locator('[class*="animate-"]').first();
      if (await animated.count()) {
        await expect
          .poll(() =>
            animated.evaluate((element) => {
              const styles = getComputedStyle(element);
              return `${styles.animationDuration}:${styles.animationName}`;
            })
          )
          .toMatch(/^(0s|0\.001s):|:none$/);
      }
    });
  }

  test("mobile public navigation restores focus and supports RTL", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });

    const opener = page.getByRole("button", { name: "Open navigation" });
    await opener.click();
    await expect(page.getByRole("dialog", { name: "Mobile navigation" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
    await expectNoPageOverflow(page);
  });

  test("reduced motion and narrow authenticated navigation remain usable", async ({ page }) => {
    await mockAuthenticatedShell(page);
    await page.addInitScript(() => {
      localStorage.setItem("za_product_tour_v1", "completed");
      localStorage.setItem("za_cookie_consent", "accepted");
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoPageOverflow(page);

    const opener = page.getByRole("button", { name: "Open navigation menu" });
    const transitionDuration = await opener.evaluate(
      (element) => getComputedStyle(element).transitionDuration
    );
    expect(transitionDuration).toMatch(/0\.01ms|1e-05s|0s/);

    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Navigation menu" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Workspace" })).toBeVisible();
  });

  test("narrow admin navigation exposes operational groups", async ({ page }) => {
    await mockAdminShell(page);
    await page.addInitScript(() => {
      localStorage.setItem("za_cookie_consent", "accepted");
    });
    await page.route(`${E2E_API_URL}/admin/stats`, (route) =>
      route.fulfill({
        json: { totalUsers: 12, activeUsers: 8, activeSessions: 4, totalLogins24h: 20 },
      })
    );
    await page.route(`${E2E_API_URL}/admin/users?limit=5`, (route) =>
      route.fulfill({ json: { data: [] } })
    );
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/admin");

    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expectNoPageOverflow(page);

    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const dialog = page.getByRole("dialog", { name: "Navigation menu" });
    for (const group of ["Identity", "Monitoring", "Governance", "Platform"]) {
      await expect(dialog.getByRole("heading", { name: group })).toBeVisible();
    }
  });
});

async function mockRepresentativeApis(page: import("@playwright/test").Page) {
  await page.route(`${E2E_API_URL}/**`, (route) => route.fulfill({ json: {} }));
  await mockAdminShell(page);
  await mockBillingApis(page);

  const org = {
    id: "levels-org",
    name: "Levels Verification Organization",
    slug: "levels-verification",
    billingEmail: "billing@example.com",
    logoUrl: null,
  };
  const member = {
    member: { userId: "admin-mock", role: "owner" },
    user: { id: "admin-mock", email: "admin@example.com", displayName: "Admin User" },
  };
  await page.route(`${E2E_API_URL}/orgs/levels-org`, (route) =>
    route.fulfill({ json: { org, memberCount: 1 } })
  );
  await page.route(`${E2E_API_URL}/orgs/levels-org/members`, (route) =>
    route.fulfill({ json: { data: [member], pagination: { total: 1 } } })
  );
  await page.route(`${E2E_API_URL}/orgs/levels-org/invites`, (route) =>
    route.fulfill({ json: { data: [], pagination: { total: 0 } } })
  );
  await page.route(`${E2E_API_URL}/orgs/levels-org/security/policy`, (route) =>
    route.fulfill({
      json: {
        policy: {
          requirePasskeyAttestation: false,
          requireHardwarePasskey: false,
          allowedPasskeyAaguids: [],
          deniedPasskeyAaguids: [],
          ipAllowlist: [],
          maxSessionAgeSeconds: 0,
          idleTimeoutSeconds: 0,
          maxConcurrentSessions: 0,
          allowedCountries: [],
        },
      },
    })
  );

  await page.route(`${E2E_API_URL}/admin/stats`, (route) =>
    route.fulfill({
      json: { totalUsers: 12, activeUsers: 8, activeSessions: 4, totalLogins24h: 20 },
    })
  );
  await page.route(`${E2E_API_URL}/admin/analytics`, (route) =>
    route.fulfill({
      json: {
        cohorts: [],
        authMethodMix: { password: 8, oauth: 3, passkey: 1, total: 12 },
        anomalyTrends: [],
      },
    })
  );
  await page.route(`${E2E_API_URL}/admin/users?*`, (route) =>
    route.fulfill({ json: { data: [], pagination: { total: 0 } } })
  );
  await page.route(`${E2E_API_URL}/admin/users/levels-user`, (route) =>
    route.fulfill({
      json: {
        id: "levels-user",
        email: "long.localized.user@example.com",
        displayName: "Levels User",
        status: "active",
        roles: ["user"],
        attributes: {},
        mfa: { totp: { enabled: false }, webauthn: { enabled: false } },
        passkeys: [],
        oauthProviders: [],
        activeSessions: 1,
        customerSegment: "new",
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
      },
    })
  );
  await page.route(`${E2E_API_URL}/admin/audit-logs?*`, (route) =>
    route.fulfill({ json: { data: [], pagination: { total: 0 } } })
  );
  const review = {
    id: "levels-review",
    title: "Quarterly privileged access review",
    status: "open",
    startedAt: "2026-07-15T00:00:00.000Z",
    completedAt: null,
    totalItems: 0,
    pendingCount: 0,
  };
  await page.route(`${E2E_API_URL}/admin/access-reviews`, (route) =>
    route.fulfill({ json: { reviews: [review] } })
  );
  await page.route(`${E2E_API_URL}/admin/access-reviews/levels-review?*`, (route) =>
    route.fulfill({ json: { review, items: [] } })
  );
  await page.route(`${E2E_API_URL}/admin/settings`, (route) =>
    route.fulfill({ json: {} })
  );
}

test.describe("Levels authenticated representative matrix", () => {
  test("organization loading state retains its page heading", async ({ page }) => {
    await mockRepresentativeApis(page);
    await page.route(`${E2E_API_URL}/orgs/levels-org`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      await route.fulfill({ json: {} });
    });
    await page.addInitScript(() => {
      localStorage.setItem("za_cookie_consent", "accepted");
      localStorage.setItem("za_product_tour_v1", "completed");
    });
    await page.goto("/dashboard/organizations/levels-org");
    await expect(page.getByRole("heading", { level: 1, name: "Organization" })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("admin user error state retains its page heading and alert", async ({ page }) => {
    await mockRepresentativeApis(page);
    await page.route(`${E2E_API_URL}/admin/users/levels-user`, (route) =>
      route.fulfill({ status: 500, json: { message: "Unavailable" } })
    );
    await page.addInitScript(() => localStorage.setItem("za_cookie_consent", "accepted"));
    await page.goto("/admin/users/levels-user");
    await expect(page.getByRole("heading", { level: 1, name: "User Detail" })).toBeVisible();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  const representatives = [
    { name: "dashboard overview", path: () => "/dashboard" },
    { name: "organization detail", path: () => "/dashboard/organizations/levels-org" },
    {
      name: "organization settings",
      path: () => "/dashboard/organizations/levels-org/settings",
    },
    { name: "dashboard security", path: () => "/dashboard/security" },
    { name: "dashboard billing", path: () => "/dashboard/billing" },
    { name: "dashboard table", path: () => "/dashboard/sessions" },
    { name: "dashboard form", path: () => "/dashboard/profile" },
    { name: "admin overview", path: () => "/admin" },
    { name: "admin analytics", path: () => "/admin/analytics" },
    { name: "admin users", path: () => "/admin/users" },
    { name: "admin user detail", path: () => "/admin/users/levels-user" },
    { name: "admin audit", path: () => "/admin/audit" },
    { name: "admin access reviews", path: () => "/admin/access-reviews" },
    { name: "admin access review detail", path: () => "/admin/access-reviews/levels-review" },
    { name: "admin settings", path: () => "/admin/settings/general" },
    { name: "admin operational table", path: () => "/admin/sessions" },
  ] as const;

  for (const representative of representatives) {
    test(`${representative.name} covers the rendered application matrix`, async ({ page }) => {
      await mockRepresentativeApis(page);
      await page.addInitScript(() => {
        if (!localStorage.getItem("theme")) localStorage.setItem("theme", "light");
        localStorage.setItem("za_cookie_consent", "accepted");
        localStorage.setItem("za_product_tour_v1", "completed");
      });
      await expectResponsiveRepresentative(page, representative.path());
    });
  }
});
