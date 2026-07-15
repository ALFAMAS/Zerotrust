import { expect, type Page } from "@playwright/test";
import { dismissCookieBanner } from "./auth";
import { E2E_API_URL } from "./urls";

export type PageSmokeCase = {
  path: string;
  /** Visible page heading (string or regex). */
  heading?: string | RegExp;
  /** Expected URL after navigation settles. */
  urlPattern?: RegExp;
};

/**
 * Visit a route and assert it rendered without auth redirects, ErrorState, or 5xx API calls.
 * Catches integration failures like broken TanStack hooks, missing prefetch auth, or SSE regressions.
 */
export async function assertPageHealthy(
  page: Page,
  { path, heading, urlPattern }: PageSmokeCase
): Promise<void> {
  const apiErrors: string[] = [];

  const onResponse = (response: import("@playwright/test").Response) => {
    const url = response.url();
    if (url.startsWith(E2E_API_URL) && response.status() >= 500) {
      apiErrors.push(`${response.status()} ${url}`);
    }
  };

  page.on("response", onResponse);

  try {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await dismissCookieBanner(page);

    const expectedUrl = urlPattern ?? new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    await expect(page).toHaveURL(expectedUrl, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/login$/);

    // ErrorState renders a "Try again" retry button.
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);

    if (heading) {
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible({
        timeout: 30_000,
      });
    }

    expect(apiErrors, `API 5xx responses while loading ${path}`).toEqual([]);
  } finally {
    page.off("response", onResponse);
  }
}
