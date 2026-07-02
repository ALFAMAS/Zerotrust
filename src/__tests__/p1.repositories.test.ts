import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));

import { getDb } from "../db";
import {
  applySubscriptionLifecycleUpdate,
  clearSubscriptionDunning,
  recordInvoicePaymentFailure,
  scheduleSubscriptionCancellation,
  setSubscriptionPaused,
  upsertCheckoutSubscription,
} from "../db/repositories/billingSubscriptions.repository";
import { createOrganizationWithOwner, transferOrganizationOwnership } from "../db/repositories/orgs.repository";
import { awardPoints } from "../db/repositories/pointsLedger.repository";
import {
  completePasskeyAuthentication,
  registerPasskey,
} from "../db/repositories/passkeys.repository";
import {
  createSupportTicketWithMessage,
  replyToSupportTicket,
  updateSupportTicketStatus,
} from "../db/repositories/supportTickets.repository";

const mockGetDb = vi.mocked(getDb);

function makeBuilder(queue: unknown[][] = []) {
  let i = 0;
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn(() => Promise.resolve(queue[i++] ?? [])),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    returning: vi.fn(() => Promise.resolve(queue[i++] ?? [])),
  };
  return builder;
}

function makeTxDb(tx: any) {
  return {
    transaction: vi.fn(async (callback: (txArg: unknown) => unknown) => callback(tx)),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("P1 transactional repositories", () => {
  it("creates an org and owner membership inside one transaction", async () => {
    const tx = makeBuilder([[{ id: "org-1", name: "Acme", slug: "acme", ownerId: "user-1" }]]);
    const db = makeTxDb(tx);
    mockGetDb.mockReturnValue(db as never);

    const org = await createOrganizationWithOwner({ name: "Acme", slug: "acme", ownerId: "user-1" });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(org.id).toBe("org-1");
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(tx.values).toHaveBeenNthCalledWith(2, {
      orgId: "org-1",
      userId: "user-1",
      role: "owner",
      joinedAt: expect.any(Date),
    });
  });

  it("transfers org ownership and both member roles inside one transaction", async () => {
    const tx = makeBuilder();
    const db = makeTxDb(tx);
    mockGetDb.mockReturnValue(db as never);

    await transferOrganizationOwnership({ orgId: "org-1", currentOwnerId: "user-old", newOwnerId: "user-new" });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(3);
    expect(tx.set).toHaveBeenNthCalledWith(1, { ownerId: "user-new", updatedAt: expect.any(Date) });
    expect(tx.set).toHaveBeenNthCalledWith(2, { role: "admin" });
    expect(tx.set).toHaveBeenNthCalledWith(3, { role: "owner" });
  });

  it("records subscription pause/cancel/reactivation mutations through a repository transaction", async () => {
    const tx = makeBuilder();
    const db = makeTxDb(tx);
    mockGetDb.mockReturnValue(db as never);

    await setSubscriptionPaused({ subscriptionId: "sub-row", userId: "user-1", reason: "taking a break" });
    await scheduleSubscriptionCancellation({ subscriptionId: "sub-row", userId: "user-1", reason: "too expensive" });
    await clearSubscriptionDunning({ subscriptionId: "sub-row" });
    await recordInvoicePaymentFailure({
      subscriptionId: "sub-row",
      existingMetadata: {},
      wasAlreadyPastDue: false,
    });
    await applySubscriptionLifecycleUpdate({
      stripeSubscriptionId: "stripe-sub",
      stripePriceId: "price_1",
      stripeProductId: "prod_1",
      plan: "pro",
      status: "active",
      currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      trialEnd: null,
    });

    expect(db.transaction).toHaveBeenCalledTimes(5);
    expect(tx.update).toHaveBeenCalledTimes(5);
    expect(tx.set).toHaveBeenCalledWith(expect.objectContaining({ status: "paused" }));
    expect(tx.set).toHaveBeenCalledWith(expect.objectContaining({ cancelAtPeriodEnd: true }));
    expect(tx.set).toHaveBeenCalledWith(expect.objectContaining({ status: "active", cancelAtPeriodEnd: false }));
    expect(tx.set).toHaveBeenCalledWith(expect.objectContaining({ status: "past_due" }));
    expect(tx.set).toHaveBeenCalledWith(expect.objectContaining({ stripePriceId: "price_1", plan: "pro" }));
  });

  it("upserts checkout subscriptions inside one transaction", async () => {
    const tx = makeBuilder();
    const db = makeTxDb(tx);
    mockGetDb.mockReturnValue(db as never);

    await upsertCheckoutSubscription({
      userId: "user-1",
      orgId: null,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "stripe-sub",
      stripePriceId: "price_1",
      stripeProductId: "prod_1",
      plan: "pro",
      status: "active",
      currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      trialEnd: null,
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(tx.onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it("awards points by reading the latest balance and inserting the next ledger row in one transaction", async () => {
    const tx = makeBuilder([[{ balanceAfter: 25 }], [{ id: "ledger-1", balanceAfter: 35 }]]);
    const db = makeTxDb(tx);
    mockGetDb.mockReturnValue(db as never);

    const entry = await awardPoints({ userId: "user-1", points: 10, reason: "signup" });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(tx.values).toHaveBeenCalledWith({
      userId: "user-1",
      points: 10,
      balanceAfter: 35,
      reason: "signup",
      metadata: null,
    });
    expect(entry).toEqual({ id: "ledger-1", balanceAfter: 35 });
  });

  it("creates a support ticket and first message inside one transaction", async () => {
    const tx = makeBuilder([
      [{ id: "ticket-1", subject: "Help", status: "open" }],
      [{ id: "msg-1", body: "Need assistance" }],
    ]);
    const db = makeTxDb(tx);
    mockGetDb.mockReturnValue(db as never);

    const result = await createSupportTicketWithMessage({
      userId: "user-1",
      subject: "Help",
      messageBody: "Need assistance",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(result.ticket.id).toBe("ticket-1");
    expect(result.message.id).toBe("msg-1");
  });

  it("replies to a support ticket and updates status inside one transaction", async () => {
    const tx = makeBuilder([[{ id: "msg-2", body: "Agent reply" }]]);
    const db = makeTxDb(tx);
    mockGetDb.mockReturnValue(db as never);

    const message = await replyToSupportTicket({
      ticketId: "ticket-1",
      authorId: "agent-1",
      authorRole: "agent",
      body: "Agent reply",
      nextStatus: "pending",
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.set).toHaveBeenCalledWith({ status: "pending", updatedAt: expect.any(Date) });
    expect(message.id).toBe("msg-2");
  });

  it("updates support ticket status through the repository", async () => {
    const db = makeBuilder([[{ id: "ticket-1", status: "closed" }]]);
    mockGetDb.mockReturnValue(db as never);

    const ticket = await updateSupportTicketStatus({ ticketId: "ticket-1", status: "closed" });

    expect(ticket.status).toBe("closed");
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("registers a passkey and enables webauthn MFA inside one transaction", async () => {
    const tx = makeBuilder([
      [{ passkeys: [], mfa: { totp: { enabled: false, backupCodes: [] }, webauthn: { enabled: false } } }],
    ]);
    const db = makeTxDb(tx);
    mockGetDb.mockReturnValue(db as never);

    await registerPasskey("user-1", {
      credentialId: "cred-1",
      publicKey: "pk",
      counter: 0,
      backedUp: false,
      transports: [],
      createdAt: new Date("2026-07-03T00:00:00.000Z"),
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({
        mfa: expect.objectContaining({ webauthn: { enabled: true } }),
      })
    );
  });

  it("completes passkey authentication with session and refresh token in one transaction", async () => {
    const tx = makeBuilder([[{ id: "session-1", userId: "user-1" }]]);
    const db = makeTxDb(tx);
    mockGetDb.mockReturnValue(db as never);

    const session = await completePasskeyAuthentication({
      userId: "user-1",
      updatedPasskeys: [],
      session: {
        id: "session-1",
        userId: "user-1",
        tokenId: "jti-1",
        deviceFingerprint: {},
        ipAddress: "127.0.0.1",
        expiresAt: new Date("2026-08-01T00:00:00.000Z"),
        isActive: true,
      },
      refreshToken: {
        userId: "user-1",
        tokenHash: "hash",
        expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(session.id).toBe("session-1");
  });
});
