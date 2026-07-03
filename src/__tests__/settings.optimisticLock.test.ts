import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));

function makeDb() {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };
  chain.from.mockReturnValue(chain);
  return chain;
}

const SETTINGS_ROW = {
  id: "saas-settings",
  emailPasswordEnabled: true,
  googleOAuthEnabled: false,
  githubOAuthEnabled: false,
  magicLinkEnabled: true,
  passkeyEnabled: true,
  totpEnabled: true,
  emailOtpEnabled: true,
  smsOtpEnabled: false,
  requireMfaForAll: false,
  sessionTTLSeconds: 3600,
  maxConcurrentSessions: 5,
  accountLockoutEnabled: true,
  accountLockoutThreshold: 5,
  accountLockoutDurationMinutes: 30,
  registrationEnabled: true,
  requireEmailVerification: false,
  allowedEmailDomains: [],
  appName: "Test",
  appUrl: "http://localhost:3000",
  supportEmail: "",
  logoUrl: "",
  version: 2,
  updatedAt: new Date(),
  updatedBy: null,
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("updateSettings optimistic locking", () => {
  it("throws SettingsVersionConflictError when expected version does not match", async () => {
    const db = makeDb();
    db.returning.mockResolvedValueOnce([]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { SettingsVersionConflictError, updateSettings } = await import(
      "../models/settings.model"
    );

    await expect(
      updateSettings({ requireMfaForAll: true }, "admin-1", 1)
    ).rejects.toBeInstanceOf(SettingsVersionConflictError);
  });

  it("returns updated settings when the version matches", async () => {
    const db = makeDb();
    db.returning.mockResolvedValueOnce([{ ...SETTINGS_ROW, requireMfaForAll: true, version: 3 }]);
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockReturnValue(db as any);

    const { updateSettings } = await import("../models/settings.model");
    const result = await updateSettings({ requireMfaForAll: true }, "admin-1", 2);

    expect(result.requireMfaForAll).toBe(true);
    expect(result.version).toBe(3);
  });
});
