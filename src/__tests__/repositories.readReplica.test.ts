import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getDb: vi.fn(),
  getReadDb: vi.fn(),
}));

import { getDb, getReadDb } from "../db";
import {
  listOrgInvites,
  listOrgMembers,
  listOrganizationsForUser,
  listPendingInvitesForEmail,
} from "../db/repositories/orgs.repository";
import { listUserSessions } from "../db/repositories/authSessions.repository";

function makeChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    innerJoin: vi.fn(),
    orderBy: vi.fn(),
    offset: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
    returning: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };
  for (const key of Object.keys(chain)) {
    chain[key].mockReturnValue(chain);
  }
  chain.limit.mockResolvedValue([]);
  return chain;
}

describe("repository read-replica routing", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("listOrganizationsForUser uses readDb", async () => {
    const read = makeChain();
    vi.mocked(getReadDb).mockReturnValue(read as never);
    await listOrganizationsForUser("user-1");
    expect(getReadDb).toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("listOrgMembers uses readDb for SELECT and count", async () => {
    const read = makeChain();
    vi.mocked(getReadDb).mockReturnValue(read as never);
    await listOrgMembers("org-1", { page: 1, limit: 20, offset: 0 });
    expect(getReadDb).toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("listOrgInvites uses readDb", async () => {
    const read = makeChain();
    vi.mocked(getReadDb).mockReturnValue(read as never);
    await listOrgInvites("org-1", { page: 1, limit: 20, offset: 0 });
    expect(getReadDb).toHaveBeenCalled();
  });

  it("listPendingInvitesForEmail uses readDb", async () => {
    const read = makeChain();
    vi.mocked(getReadDb).mockReturnValue(read as never);
    await listPendingInvitesForEmail("a@b.com", { page: 1, limit: 20, offset: 0 });
    expect(getReadDb).toHaveBeenCalled();
  });

  it("listUserSessions uses readDb", async () => {
    const read = makeChain();
    vi.mocked(getReadDb).mockReturnValue(read as never);
    await listUserSessions("user-1", { page: 1, limit: 20, offset: 0 });
    expect(getReadDb).toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });
});
