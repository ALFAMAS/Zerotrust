import { expect, test } from "@playwright/test";
import { mockAuthenticatedShell } from "./fixtures/apiMocks";
import { assertPageHealthy } from "./fixtures/pageHealth";
import { readAccessToken, registerViaUi, uniqueEmail } from "./fixtures/auth";
import { E2E_API_URL } from "./fixtures/urls";

test.describe("notifications (real API)", () => {
  test("notification settings page loads and bell opens without error", async ({ page }) => {
    await registerViaUi(page, uniqueEmail());

    await assertPageHealthy(page, {
      path: "/dashboard/notifications",
      heading: "Notifications",
    });

    const bell = page.getByRole("button", { name: /notifications/i });
    await expect(bell).toBeVisible();
    await bell.click();

    await expect(page.getByText("No notifications")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  });

  test("notification SSE uses Authorization header, not ?token= query param", async ({
    page,
  }) => {
    await registerViaUi(page, uniqueEmail());

    let sseRequestAuth: string | null = null;
    let sseUrl = "";

    page.on("request", (req) => {
      if (!req.url().includes("/notifications/sse")) return;
      sseUrl = req.url();
      sseRequestAuth = req.headers().authorization ?? null;
    });

    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: /notifications/i })).toBeVisible({
      timeout: 15_000,
    });

    await expect.poll(() => sseUrl.length > 0, { timeout: 15_000 }).toBeTruthy();
    expect(sseUrl).not.toContain("token=");
    expect(sseRequestAuth).toMatch(/^Bearer /);

    const token = await readAccessToken(page);
    expect(token).toBeTruthy();
    expect(sseRequestAuth).toBe(`Bearer ${token}`);
  });
});

test.describe("notifications (mocked shell)", () => {
  test("preferences toggles render", async ({ page }) => {
    await mockAuthenticatedShell(page);
    await page.route(`${E2E_API_URL}/notifications/preferences`, (route) =>
      route.fulfill({
        json: {
          emailFallback: true,
          emailFallbackDays: 3,
          security: true,
          billing: true,
          account: true,
          social: true,
          system: true,
        },
      })
    );

    await assertPageHealthy(page, {
      path: "/dashboard/notifications",
      heading: "Notifications",
    });

    await expect(page.getByText("Per-category preferences")).toBeVisible();
    await expect(page.locator("#main-content").getByText("Security", { exact: true })).toBeVisible();
  });
});
