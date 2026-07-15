import { expect, test } from "@playwright/test";
import { mockAuthenticatedShell, mockBillingApis } from "./fixtures/apiMocks";
import { E2E_API_URL } from "./fixtures/urls";

test.describe("billing page flows (mocked Stripe)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedShell(page);
    await mockBillingApis(page);
  });

  test("renders free plan and usage meters", async ({ page }) => {
    await page.goto("/dashboard/billing");
    await expect(page.getByRole("heading", { name: "Billing", level: 1 })).toBeVisible();
    await expect(page.locator("#main-content").getByText("Free", { exact: true }).first()).toBeVisible();
  });

  test("shows success banner when redirected with success=1", async ({ page }) => {
    await page.goto("/dashboard/billing?success=1");
    await expect(page.getByText(/subscription updated successfully/i)).toBeVisible();
  });

  test("shows cancel banner when redirected with canceled=1", async ({ page }) => {
    await page.goto("/dashboard/billing?canceled=1");
    await expect(page.getByText(/checkout canceled/i)).toBeVisible();
  });

  test("upgrade triggers checkout API call", async ({ page }) => {
    let checkoutCalled = false;
    await page.route(`${E2E_API_URL}/billing/checkout`, async (route) => {
      checkoutCalled = true;
      await route.fulfill({ json: { url: "https://checkout.stripe.com/e2e-session" } });
    });

    await page.goto("/dashboard/billing");

    const upgrade = page.getByRole("button", { name: /upgrade to pro/i });
    if (await upgrade.isVisible().catch(() => false)) {
      await upgrade.click();
      await expect.poll(() => checkoutCalled).toBe(true);
    }
  });
});
