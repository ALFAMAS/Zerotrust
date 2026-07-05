import { expect, test } from "@playwright/test";
import { mockAuthenticatedShell } from "./fixtures/apiMocks";

test.describe("wallet page", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedShell(page);
  });

  test("shows wallet balance from the API", async ({ page }) => {
    await page.route("http://localhost:1337/wallet", (route) =>
      route.fulfill({
        json: { balance: 4200, lifetimeBalance: 9000, currency: "USD", autoTopUp: false },
      })
    );
    await page.route("http://localhost:1337/wallet/transactions*", (route) =>
      route.fulfill({ json: { data: [], pagination: { total: 0 } } })
    );

    await page.goto("/dashboard/wallet");

    await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible();
    await expect(page.locator("#main-content").getByText("$42.00")).toBeVisible();
  });
});
