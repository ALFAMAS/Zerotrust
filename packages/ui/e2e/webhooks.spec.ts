import { expect, test } from "@playwright/test";

test.describe("webhooks page", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("za_access_token", "test-token");
    });
  });

  test("lists webhook endpoints", async ({ page }) => {
    await page.route("http://localhost:1337/webhooks", (route) =>
      route.fulfill({
        json: [
          {
            id: "wh1",
            url: "https://hooks.example.com/zt",
            events: ["user.created"],
            enabled: true,
            createdAt: "2026-06-01T00:00:00Z",
          },
        ],
      })
    );

    await page.goto("/dashboard/webhooks");

    await expect(page.getByRole("heading", { name: "Webhooks" })).toBeVisible();
    await expect(page.getByText("https://hooks.example.com/zt")).toBeVisible();
  });
});
