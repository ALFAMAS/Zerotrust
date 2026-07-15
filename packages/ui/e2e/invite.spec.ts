import { expect, test } from "@playwright/test";
import { registerAndGetUserId, uniqueEmail } from "./fixtures/auth";
import { getInviteTokenByEmail, verifyUserEmail } from "./fixtures/db";
import { E2E_API_URL } from "./fixtures/urls";

test.describe("organization invite flow (real API)", () => {
  test.describe.configure({ mode: "serial" });

  let inviteToken = "";
  const inviteeEmail = uniqueEmail();
  const ownerEmail = uniqueEmail();

  test("owner invites a member via API", async ({ page }) => {
    const { token, userId } = await registerAndGetUserId(page, ownerEmail);
    await verifyUserEmail(userId);

    const orgRes = await page.request.post(`${E2E_API_URL}/orgs`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { name: "Invite E2E Org", slug: `invite-e2e-${Date.now()}` },
    });
    expect(orgRes.ok()).toBeTruthy();
    const { org } = (await orgRes.json()) as { org: { id: string } };

    const inviteRes = await page.request.post(`${E2E_API_URL}/orgs/${org.id}/invites`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { email: inviteeEmail, role: "member" },
    });
    expect(inviteRes.ok()).toBeTruthy();

    inviteToken = await getInviteTokenByEmail(inviteeEmail);
    expect(inviteToken.length).toBeGreaterThan(10);
  });

  test("invitee accepts invite at /invite/[token]", async ({ browser }) => {
    expect(inviteToken).toBeTruthy();

    const context = await browser.newContext();
    const page = await context.newPage();
    await registerAndGetUserId(page, inviteeEmail);

    await page.goto(`/invite/${inviteToken}`);
    await expect(
      page.getByRole("heading", { name: /you've joined invite e2e org/i })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/your role:/i)).toBeVisible();

    await context.close();
  });
});
