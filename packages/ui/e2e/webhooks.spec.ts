import { expect, test } from "@playwright/test";
import { mockAuthenticatedShell } from "./fixtures/apiMocks";
import { E2E_API_URL } from "./fixtures/urls";

test.describe("webhooks page", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedShell(page);
  });

  test("lists webhook endpoints", async ({ page }) => {
    await page.route(`${E2E_API_URL}/webhooks`, (route) =>
      route.fulfill({
        json: [
          {
            id: "wh-1",
            url: "https://hooks.example.com/zt",
            events: ["user.created"],
            active: true,
            createdAt: new Date().toISOString(),
          },
        ],
      })
    );

    await page.goto("/dashboard/webhooks");

    await expect(page.getByRole("heading", { name: "Webhooks" })).toBeVisible();
    await expect(page.getByText("https://hooks.example.com/zt")).toBeVisible();
  });
});
