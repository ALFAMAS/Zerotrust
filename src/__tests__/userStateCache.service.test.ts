import { beforeEach, describe, expect, it, vi } from "vitest";

const redisMock = vi.hoisted(() => ({
  client: {
    del: vi.fn().mockResolvedValue(1),
    get: vi.fn(),
    set: vi.fn().mockResolvedValue("OK"),
  },
}));

vi.mock("../logger", () => ({
  getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock("../services/rateLimiter/redis", () => ({
  getRedis: () => redisMock.client,
}));

function makeUser() {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "alice@example.com",
    username: null,
    passwordHash: null,
    phone: null,
    displayName: "Alice",
    avatarUrl: null,
    roles: ["user"],
    attributes: {},
    mfa: { totp: { enabled: false, backupCodes: [] }, webauthn: { enabled: false } },
    passkeys: [],
    oauthProviders: [],
    status: "active",
    parentUserId: null,
    subUserIds: [],
    sessionConfig: {},
    lastLoginAt: null,
    metadata: null,
    emailVerifiedAt: null,
    locale: "en",
    customerSegment: null,
    legalHold: false,
    legalHoldReason: null,
    legalHoldAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
}

describe("user state cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores user state in Redis with a 5 second TTL", async () => {
    const { USER_STATE_CACHE_TTL_SECONDS, cacheUserState } = await import(
      "../services/userStateCache.service"
    );
    const user = makeUser();

    await cacheUserState(user as never);

    expect(USER_STATE_CACHE_TTL_SECONDS).toBe(5);
    expect(redisMock.client.set).toHaveBeenCalledWith(
      `auth:user:${user.id}`,
      JSON.stringify(user),
      "EX",
      5
    );
  });

  it("reads cached user state and hydrates date fields", async () => {
    const user = makeUser();
    redisMock.client.get.mockResolvedValueOnce(JSON.stringify(user));
    const { getUserCached } = await import("../services/userStateCache.service");

    const cached = await getUserCached(user.id);

    expect(redisMock.client.get).toHaveBeenCalledWith(`auth:user:${user.id}`);
    expect(cached?.id).toBe(user.id);
    expect(cached?.createdAt).toBeInstanceOf(Date);
    expect(cached?.updatedAt).toBeInstanceOf(Date);
  });

  it("invalidates cached user state explicitly", async () => {
    const { invalidateUserCache } = await import("../services/userStateCache.service");
    const userId = "00000000-0000-0000-0000-000000000001";

    await invalidateUserCache(userId);

    expect(redisMock.client.del).toHaveBeenCalledWith(`auth:user:${userId}`);
  });
});
