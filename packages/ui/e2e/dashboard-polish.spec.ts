import { expect, test } from "@playwright/test";

const completeUser = {
  id: "user-complete",
  email: "complete@example.com",
  emailVerified: true,
  displayName: "Complete User",
  avatarUrl: "https://example.com/avatar.png",
  mfa: { totp: { enabled: true } },
  passkeys: [{ credentialId: "passkey-1", name: "Laptop", createdAt: new Date().toISOString() }],
  oauthProviders: [],
};

test.describe("dashboard polish", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("za_access_token", "test-token");
    });
  });

  test("shows the progress widget with profile completeness", async ({ page }) => {
    await page.route("http://localhost:1337/auth/me", (route) =>
      route.fulfill({ json: completeUser })
    );
    await page.route("http://localhost:1337/sessions", (route) =>
      route.fulfill({
        json: {
          sessions: [{ id: "session-1", isActive: true }],
        },
      })
    );

    await page.goto("/dashboard");

    // ProgressBars renders the "Your Progress" widget with a profile-completeness bar.
    await expect(page.getByText("Your Progress")).toBeVisible();
    await expect(page.getByText("Profile completeness")).toBeVisible();
    // completeUser satisfies all four profile fields → "4/4 fields".
    await expect(page.getByText("4/4 fields")).toBeVisible();
  });

  test("notifies onboarding-complete and shows the completion card at 100%", async ({ page }) => {
    await page.route("http://localhost:1337/auth/me", (route) =>
      route.fulfill({ json: completeUser })
    );
    await page.route("http://localhost:1337/sessions", (route) =>
      route.fulfill({ json: { sessions: [{ id: "session-1", isActive: true }] } })
    );
    // SetupChecklist POSTs here once every setup step is done.
    let onboardingCalls = 0;
    await page.route("http://localhost:1337/auth/me/onboarding-complete", (route) => {
      onboardingCalls++;
      return route.fulfill({ json: { ok: true } });
    });

    await page.goto("/dashboard");

    // A fully set-up user sees the completion card and the API is notified.
    await expect(page.getByText("Onboarding complete")).toBeVisible();
    await expect.poll(() => onboardingCalls).toBeGreaterThanOrEqual(1);
  });
});

test("native support chat posts to the mounted support API", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("za_access_token", "test-token");
  });
  await page.route("http://localhost:1337/auth/me", (route) =>
    route.fulfill({ json: completeUser })
  );
  await page.route("http://localhost:1337/sessions", (route) =>
    route.fulfill({ json: { sessions: [{ id: "session-1", isActive: true }] } })
  );

  let supportRequest: { subject?: string; message?: string } | null = null;
  await page.route("http://localhost:1337/support", async (route) => {
    supportRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: { ticket: { id: "ticket-1" }, messages: [] },
    });
  });

  await page.goto("/dashboard");
  await page.getByRole("button", { name: /open support chat/i }).click();
  await page.getByLabel(/support message/i).fill("Need help with billing");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/ticket has been created/i)).toBeVisible();
  expect(supportRequest).toMatchObject({
    subject: "Need help with billing",
    message: "Need help with billing",
  });
});
