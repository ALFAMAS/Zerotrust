import { expect, test } from "@playwright/test";
import { dismissCookieBanner } from "./fixtures/auth";

// Public, unauthenticated pages. These exercise rendering, navigation, and
// client-side validation only — they do not depend on the API/DB being healthy
// (apart from the dev server serving the pages).

test.describe("public pages", () => {
  test("landing page renders with primary CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /ship secure auth/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
  });

  test("landing page exposes hreflang alternates", async ({ page }) => {
    await page.goto("/");

    // hreflang alternates are path-based (`<brand.url>/<locale>`), per the
    // `alternates.languages` map in src/app/layout.tsx — not `?locale=` query params.
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      "href",
      /\/en$/
    );
    await expect(page.locator('link[rel="alternate"][hreflang="es"]')).toHaveAttribute(
      "href",
      /\/es$/
    );
    await expect(page.locator('link[rel="alternate"][hreflang="fr"]')).toHaveAttribute(
      "href",
      /\/fr$/
    );
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      "href",
      /localhost:3000/
    );
  });

  test("login page renders the sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /passkey/i })).toBeVisible();
  });

  test("/auth/login redirects to the login page (API path alias)", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("/wallet redirects to the dashboard wallet page (API path alias)", async ({ page }) => {
    await page.goto("/wallet");
    await expect(page).toHaveURL(/\/dashboard\/wallet/);
  });

  test("/security serves the public disclosure page (not the dashboard)", async ({ page }) => {
    await page.goto("/security");
    await expect(page).toHaveURL(/\/security$/);
    await expect(
      page.getByRole("heading", { name: "Security & Responsible Disclosure" })
    ).toBeVisible();
  });

  test("/en/dashboard redirects to /dashboard (locale prefix alias)", async ({ page }) => {
    await page.goto("/en/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("/en redirects to the landing page (hreflang locale prefix)", async ({ page }) => {
    await page.goto("/en");
    await expect(page).toHaveURL(/\/(?:$|\?)/);
    await expect(page.getByRole("heading", { name: /ship secure auth/i })).toBeVisible();
  });

  test("navigates between login and register", async ({ page }) => {
    await page.goto("/login");
    await dismissCookieBanner(page);
    await page.getByRole("link", { name: /create one/i }).click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();

    await page.getByRole("link", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("register surfaces a client-side error for mismatched passwords", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Display Name").fill("Mismatch User");
    await page.getByLabel("Email").fill(`mismatch_${Date.now()}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("StrongPass123!");
    await page.getByLabel("Confirm Password").fill("DifferentPass123!");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
    // Stays on the register page — no submission happened.
    await expect(page).toHaveURL(/\/register/);
  });
});
