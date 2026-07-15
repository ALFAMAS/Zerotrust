import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { readAccessToken, registerAndGetUserId, uniqueEmail, withStoredAuth } from "./fixtures/auth";
import { grantAdminRole, verifyUserEmail } from "./fixtures/db";
import { E2E_API_URL } from "./fixtures/urls";

const ADMIN_AUTH_FILE = "e2e/.auth/access-review-admin.json";

type ReviewItem = { id: string; decision: string };

async function approveAllPendingViaApi(
  page: import("@playwright/test").Page,
  token: string,
  reviewId: string
): Promise<void> {
  let pageNum = 1;
  let hasNext = true;

  while (hasNext) {
    const detailRes = await page.request.get(
      `${E2E_API_URL}/admin/access-reviews/${reviewId}?page=${pageNum}&limit=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(detailRes.ok()).toBeTruthy();

    const detail = (await detailRes.json()) as {
      items?: ReviewItem[] | { data: ReviewItem[]; pagination?: { hasNext?: boolean } };
    };
    const items = Array.isArray(detail.items) ? detail.items : (detail.items?.data ?? []);
    const pagination = Array.isArray(detail.items) ? undefined : detail.items?.pagination;

    for (const item of items) {
      if (item.decision !== "pending") continue;
      const patchRes = await page.request.patch(
        `${E2E_API_URL}/admin/access-reviews/${reviewId}/items/${item.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          data: { decision: "approved" },
        }
      );
      expect(patchRes.ok()).toBeTruthy();
    }

    hasNext = pagination?.hasNext ?? false;
    pageNum += 1;
  }
}

test.describe("access review lifecycle (real API)", () => {
  test.beforeAll(async ({ browser }) => {
    mkdirSync("e2e/.auth", { recursive: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const email = uniqueEmail();

    const { userId } = await registerAndGetUserId(page, email);
    await verifyUserEmail(userId);
    await grantAdminRole(userId);

    await context.storageState({ path: ADMIN_AUTH_FILE });
    await context.close();
  });

  test("start review, approve via UI + API, and complete", async ({ browser }) => {
    await withStoredAuth(browser, ADMIN_AUTH_FILE, async (page) => {
      await page.goto("/admin/access-reviews");
      await expect(page.getByRole("heading", { name: "Access Reviews", level: 1 })).toBeVisible();

      await page.getByRole("button", { name: /start new review/i }).click();
      await expect(page.getByText(/review started/i)).toBeVisible({ timeout: 20_000 });

      const reviewLink = page.locator("table a").first();
      await expect(reviewLink).toBeVisible({ timeout: 15_000 });
      const href = await reviewLink.getAttribute("href");
      expect(href).toMatch(/\/admin\/access-reviews\//);
      const reviewId = href!.split("/").pop()!;

      await reviewLink.click();
      await expect(page).toHaveURL(new RegExp(`/admin/access-reviews/${reviewId}(?:\\?.*)?$`), {
        timeout: 30_000,
      });
      await expect(page.getByRole("button", { name: /complete review/i })).toBeVisible({
        timeout: 30_000,
      });

      const token = await readAccessToken(page);
      expect(token).toBeTruthy();

      const firstApprove = page.locator("table tbody").getByRole("button", { name: "Approve" }).first();
      if (await firstApprove.isVisible().catch(() => false)) {
        await firstApprove.click();
        await expect(page.locator("table tbody").getByText("approved").first()).toBeVisible({
          timeout: 20_000,
        });
      }

      await approveAllPendingViaApi(page, token, reviewId);

      await page.goto(`/admin/access-reviews/${reviewId}`);
      const completeBtn = page.getByRole("button", { name: /complete review/i });
      await expect(completeBtn).toBeEnabled({ timeout: 20_000 });
      await completeBtn.click();
      await expect(page.getByText(/review completed/i)).toBeVisible({ timeout: 20_000 });
    });
  });
});
