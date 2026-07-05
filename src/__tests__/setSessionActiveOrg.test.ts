import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/orgMembership", () => ({
  verifyOrgMembership: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

import { verifyOrgMembership } from "../db/orgMembership";
import { getDb } from "../db";
import { setSessionActiveOrg } from "../db/repositories/authSessions.repository";
import type { User } from "../shared/types";

const mockVerify = vi.mocked(verifyOrgMembership);
const mockGetDb = vi.mocked(getDb);

function testUser(): User {
  return {
    id: "user-1",
    email: "u@example.com",
    displayName: "User",
    roles: ["user"],
    attributes: {},
    mfa: { totp: { enabled: false, backupCodes: [] }, webauthn: { enabled: false } },
    passkeys: [],
    oauthProviders: [],
    status: "active",
    subUserIds: [],
    sessionConfig: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("setSessionActiveOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects org switch when membership check fails", async () => {
    mockVerify.mockResolvedValue(false);

    const updated = await setSessionActiveOrg({
      sessionId: "session-1",
      orgId: "org-1",
      userId: "user-1",
      user: testUser(),
    });

    expect(updated).toBe(false);
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it("persists active org on the session row", async () => {
    mockVerify.mockResolvedValue(true);
    const returning = vi.fn().mockResolvedValue([{ id: "session-1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    mockGetDb.mockReturnValue({ update } as never);

    const updated = await setSessionActiveOrg({
      sessionId: "session-1",
      orgId: "org-1",
      userId: "user-1",
      user: testUser(),
    });

    expect(updated).toBe(true);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ activeOrgId: "org-1", updatedAt: expect.any(Date) })
    );
  });
});
