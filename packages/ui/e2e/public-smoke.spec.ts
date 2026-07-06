import { expect, test } from "@playwright/test";
import { assertPageHealthy } from "./fixtures/pageHealth";

test.describe("public page smoke", () => {
  const publicPages = [
    { path: "/help", heading: "Help center" },
    { path: "/privacy", heading: "Privacy Policy" },
    { path: "/terms", heading: "Terms of Service" },
    { path: "/security", heading: "Security & Responsible Disclosure" },
    { path: "/status", heading: "System status" },
    { path: "/forgot-password", heading: "Reset password" },
    { path: "/magic-link", heading: "Magic link login" },
  ];

  for (const pageCase of publicPages) {
    test(`loads ${pageCase.path}`, async ({ page }) => {
      await assertPageHealthy(page, pageCase);
    });
  }
});
