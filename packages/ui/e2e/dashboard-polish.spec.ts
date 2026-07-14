import { expect, test } from "@playwright/test";
import { mockAuthenticatedShell, type MockUser } from "./fixtures/apiMocks";

const completeUser: MockUser = {
  id: "user-complete",
  email: "complete@example.com",
  emailVerified: true,
  displayName: "Complete User",
  avatarUrl: "https://example.com/avatar.png",
  mfa: { totp: { enabled: true } },
  passkeys: [{ credentialId: "passkey-1", name: "Laptop", createdAt: new Date().toISOString() }],
  oauthProviders: [],
  onboarding: {
    hasOrg: true,
    hasSentInvite: true,
    hasMfa: true,
    hasApiKey: true,
    completedAt: null,
  },
};

test.describe("dashboard polish", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedShell(page, completeUser);
  });

  test("shows the progress widget with profile completeness", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByText("Your Progress")).toBeVisible();
    await expect(page.getByText("Profile completeness")).toBeVisible();
    await expect(page.getByText("4/4 fields")).toBeVisible();
  });

  test("notifies onboarding-complete and shows the completion card at 100%", async ({ page }) => {
    let onboardingCalls = 0;
    await page.route("http://localhost:1337/auth/me/onboarding-complete", (route) => {
      onboardingCalls++;
      return route.fulfill({ json: { ok: true } });
    });

    await page.goto("/dashboard");

    await expect(page.getByText("Onboarding complete")).toBeVisible();
    await expect.poll(() => onboardingCalls).toBeGreaterThanOrEqual(1);
  });
});

test("native support chat posts to the mounted support API", async ({ page }) => {
  await mockAuthenticatedShell(page, completeUser);

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
