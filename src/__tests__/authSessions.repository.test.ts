import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../db";
import {
  revokeRefreshTokenFamily,
  revokeSessionAtLogout,
  rotateRefreshToken,
} from "../db/repositories/authSessions.repository";

const mockGetDb = vi.mocked(getDb);

describe("authSessions repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes a reused refresh token family inside one transaction", async () => {
    const familyWhere = vi.fn().mockResolvedValue([
      { sessionId: "session-1" },
      { sessionId: "session-2" },
    ]);
    const familyFrom = vi.fn().mockReturnValue({ where: familyWhere });
    const tokenWhere = vi.fn().mockResolvedValue(undefined);
    const tokenSet = vi.fn().mockReturnValue({ where: tokenWhere });
    const sessionWhere = vi.fn().mockResolvedValue(undefined);
    const sessionSet = vi.fn().mockReturnValue({ where: sessionWhere });
    const update = vi
      .fn()
      .mockReturnValueOnce({ set: tokenSet })
      .mockReturnValueOnce({ set: sessionSet });
    const select = vi.fn().mockReturnValue({ from: familyFrom });
    const tx = { update, select };
    const transaction = vi.fn(async (callback) => callback(tx));
    mockGetDb.mockReturnValue({ transaction } as never);

    await revokeRefreshTokenFamily("family-1", "refresh_token_reuse");

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(2);
    expect(tokenSet).toHaveBeenCalledWith({ isRevoked: true });
    expect(sessionSet).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: false,
        revokedReason: "refresh_token_reuse",
        revokedAt: expect.any(Date),
      })
    );
  });

  it("rotates a refresh token, session, and replacement token inside one transaction", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });

    const sessionReturning = vi.fn().mockResolvedValue([{ id: "session-2" }]);
    const sessionValues = vi.fn().mockReturnValue({ returning: sessionReturning });
    const refreshValues = vi.fn().mockResolvedValue(undefined);
    const insert = vi
      .fn()
      .mockReturnValueOnce({ values: sessionValues })
      .mockReturnValueOnce({ values: refreshValues });

    const tx = { update, insert };
    const transaction = vi.fn(async (callback) => callback(tx));
    mockGetDb.mockReturnValue({ transaction } as never);

    const session = await rotateRefreshToken({
      oldRefreshTokenId: "rt-1",
      session: {
        id: "session-2",
        userId: "user-1",
        tokenId: "jti-2",
        deviceFingerprint: {},
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
        expiresAt: new Date("2026-06-30T00:00:00.000Z"),
        lastActivityAt: new Date("2026-06-30T00:00:00.000Z"),
        isActive: true,
      },
      refreshToken: {
        userId: "user-1",
        tokenHash: "new-refresh-hash",
        familyId: "family-1",
        expiresAt: new Date("2026-07-07T00:00:00.000Z"),
      },
    });

    expect(session).toEqual({ id: "session-2" });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith({
      isRevoked: true,
      usedAt: expect.any(Date),
    });
    expect(sessionValues).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-2", tokenId: "jti-2" })
    );
    expect(refreshValues).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-2",
      tokenHash: "new-refresh-hash",
      familyId: "family-1",
      expiresAt: new Date("2026-07-07T00:00:00.000Z"),
    });
  });

  it("propagates rotation failures from the transaction callback", async () => {
    const expected = new Error("session insert failed");
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });
    const sessionReturning = vi.fn().mockRejectedValue(expected);
    const sessionValues = vi.fn().mockReturnValue({ returning: sessionReturning });
    const insert = vi.fn().mockReturnValueOnce({ values: sessionValues });
    const transaction = vi.fn(async (callback) => callback({ update, insert }));
    mockGetDb.mockReturnValue({ transaction } as never);

    await expect(
      rotateRefreshToken({
        oldRefreshTokenId: "rt-1",
        session: {
          id: "session-2",
          userId: "user-1",
          tokenId: "jti-2",
          deviceFingerprint: {},
          ipAddress: "127.0.0.1",
          expiresAt: new Date("2026-06-30T00:00:00.000Z"),
          lastActivityAt: new Date("2026-06-30T00:00:00.000Z"),
          isActive: true,
        },
        refreshToken: {
          userId: "user-1",
          tokenHash: "new-refresh-hash",
          familyId: "family-1",
          expiresAt: new Date("2026-07-07T00:00:00.000Z"),
        },
      })
    ).rejects.toThrow(expected);
  });

  it("revokes session and refresh token on logout inside one transaction", async () => {
    const refreshWhere = vi.fn().mockResolvedValue(undefined);
    const refreshSet = vi.fn().mockReturnValue({ where: refreshWhere });
    const sessionWhere = vi.fn().mockResolvedValue(undefined);
    const sessionSet = vi.fn().mockReturnValue({ where: sessionWhere });
    const update = vi
      .fn()
      .mockReturnValueOnce({ set: refreshSet })
      .mockReturnValueOnce({ set: sessionSet })
      .mockReturnValueOnce({ set: refreshSet });
    const selectLimit = vi
      .fn()
      .mockResolvedValue([{ id: "rt-1", sessionId: "session-1" }]);
    const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const select = vi.fn().mockReturnValue({ from: selectFrom });
    const tx = { update, select };
    const transaction = vi.fn(async (callback) => callback(tx));
    mockGetDb.mockReturnValue({ transaction } as never);

    const revoked = await revokeSessionAtLogout({
      refreshTokenPlain: "plain-refresh-token",
    });

    expect(revoked).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(3);
    expect(sessionSet).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: false,
        revokedReason: "logout",
        revokedAt: expect.any(Date),
      })
    );
  });

  it("revokes by session id when bearer auth supplies the active session", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const tx = { update };
    const transaction = vi.fn(async (callback) => callback(tx));
    mockGetDb.mockReturnValue({ transaction } as never);

    const revoked = await revokeSessionAtLogout({ sessionId: "session-9" });

    expect(revoked).toBe(true);
    expect(update).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ isActive: false, revokedReason: "logout" })
    );
    expect(set).toHaveBeenNthCalledWith(2, { isRevoked: true });
  });
});
