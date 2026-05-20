import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthorizationEngine } from "../services/authz.service";
import type { AuthzContext, User, Session } from "../shared/types";

let findOneResult: any = null;
let findByIdResult: any = null;
let jitResult: any[] = [];

vi.mock("../models/index", () => ({
  RoleModel: {
    findOne: vi.fn().mockImplementation(() => ({ lean: () => Promise.resolve(findOneResult) })),
    findById: vi.fn().mockImplementation(() => ({ lean: () => Promise.resolve(findByIdResult) })),
  },
  JITModel: {
    find: vi.fn().mockImplementation(() => ({
      populate: vi.fn().mockReturnThis(),
      lean: () => Promise.resolve(jitResult),
    })),
  },
}));

const mockUser: User = {
  _id: "user1" as any,
  email: "user@test.com",
  displayName: "Test User",
  roles: ["viewer"],
  attributes: {},
  mfa: { totp: { enabled: false, backupCodes: [] }, webauthn: { enabled: false } },
  passkeys: [],
  oauthProviders: [],
  status: "active",
  subUserIds: [],
  sessionConfig: {
    maxDevices: 5,
    allowedCountries: [],
    allowedIpRanges: [],
    scheduleRestriction: {
      enabled: false,
      timezone: "UTC",
      allowedDays: [],
      allowedHoursStart: 0,
      allowedHoursEnd: 23,
    },
  },
};

const mockSession: Session = {
  _id: "sess1" as any,
  userId: "user1" as any,
  tokenId: "jti1",
  deviceFingerprint: {
    hash: "h1",
    languages: [],
    isTrusted: true,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  },
  ipAddress: "127.0.0.1",
  userAgent: "test",
  expiresAt: new Date(Date.now() + 3600000),
  lastActivityAt: new Date(),
  isActive: true,
};

const baseCtx: AuthzContext = {
  user: mockUser,
  session: mockSession,
  resource: "documents",
  action: "read",
  environment: {
    currentTime: new Date(),
    currentIp: "127.0.0.1",
    userAgent: "test",
    riskScore: 10,
  },
};

const engine = new AuthorizationEngine();

describe("AuthorizationEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOneResult = null;
    findByIdResult = null;
    jitResult = [];
  });

  it("allows when role has matching permission", async () => {
    const role = {
      _id: "role1",
      name: "viewer",
      permissions: [{ resource: "documents", actions: ["read"], conditions: [] }],
      parentRoleId: null,
    };
    findOneResult = role;
    findByIdResult = role;

    const result = await engine.evaluate(baseCtx);
    expect(result.allowed).toBe(true);
  });

  it("denies when no matching permission", async () => {
    const role = {
      _id: "role1",
      name: "viewer",
      permissions: [{ resource: "users", actions: ["read"], conditions: [] }],
      parentRoleId: null,
    };
    findOneResult = role;
    findByIdResult = role;

    const result = await engine.evaluate(baseCtx);
    expect(result.allowed).toBe(false);
  });

  it("allows wildcard action", async () => {
    const role = {
      _id: "role1",
      name: "viewer",
      permissions: [{ resource: "documents", actions: ["*"], conditions: [] }],
      parentRoleId: null,
    };
    findOneResult = role;
    findByIdResult = role;

    const result = await engine.evaluate({ ...baseCtx, action: "delete" });
    expect(result.allowed).toBe(true);
  });

  it("allows wildcard resource prefix", async () => {
    const role = {
      _id: "role1",
      name: "viewer",
      permissions: [{ resource: "documents:*", actions: ["read"], conditions: [] }],
      parentRoleId: null,
    };
    findOneResult = role;
    findByIdResult = role;

    const result = await engine.evaluate({ ...baseCtx, resource: "documents:drafts" });
    expect(result.allowed).toBe(true);
  });

  it("evaluates ABAC eq condition — match", async () => {
    const user = { ...mockUser, attributes: { department: "engineering" } };
    const role = {
      _id: "role1",
      name: "viewer",
      permissions: [
        {
          resource: "documents",
          actions: ["read"],
          conditions: [
            { attribute: "user.attributes.department", operator: "eq", value: "engineering" },
          ],
        },
      ],
      parentRoleId: null,
    };
    findOneResult = role;
    findByIdResult = role;

    const result = await engine.evaluate({ ...baseCtx, user });
    expect(result.allowed).toBe(true);
  });

  it("evaluates ABAC eq condition — no match", async () => {
    const user = { ...mockUser, attributes: { department: "sales" } };
    const role = {
      _id: "role1",
      name: "viewer",
      permissions: [
        {
          resource: "documents",
          actions: ["read"],
          conditions: [
            { attribute: "user.attributes.department", operator: "eq", value: "engineering" },
          ],
        },
      ],
      parentRoleId: null,
    };
    findOneResult = role;
    findByIdResult = role;

    const result = await engine.evaluate({ ...baseCtx, user });
    expect(result.allowed).toBe(false);
  });

  it("includes JIT-granted roles in evaluation", async () => {
    const editorRole = {
      _id: "editor-role",
      name: "editor",
      permissions: [{ resource: "documents", actions: ["write"], conditions: [] }],
      parentRoleId: null,
    };
    jitResult = [{ roleId: { _id: "editor-role", name: "editor" } }];
    findOneResult = editorRole;
    findByIdResult = editorRole;

    const result = await engine.evaluate({ ...baseCtx, action: "write" });
    expect(result.allowed).toBe(true);
  });

  it("blocks access outside schedule restriction", async () => {
    const restrictedUser: User = {
      ...mockUser,
      sessionConfig: {
        ...mockUser.sessionConfig,
        scheduleRestriction: {
          enabled: true,
          timezone: "UTC",
          allowedDays: [1, 2, 3, 4, 5],
          allowedHoursStart: 9,
          allowedHoursEnd: 17,
        },
      },
    };
    const lateNight = new Date("2024-01-15T23:00:00Z");
    const ctx = {
      ...baseCtx,
      user: restrictedUser,
      environment: { ...baseCtx.environment, currentTime: lateNight },
    };
    const result = await engine.evaluate(ctx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("SCHEDULE");
  });

  it("handles in operator in ABAC conditions", async () => {
    const user = { ...mockUser, attributes: { clearanceLevel: 3 } };
    const role = {
      _id: "role1",
      name: "viewer",
      permissions: [
        {
          resource: "documents",
          actions: ["read"],
          conditions: [{ attribute: "user.attributes.clearanceLevel", operator: "gte", value: 2 }],
        },
      ],
      parentRoleId: null,
    };
    findOneResult = role;
    findByIdResult = role;

    const result = await engine.evaluate({ ...baseCtx, user });
    expect(result.allowed).toBe(true);
  });
});
