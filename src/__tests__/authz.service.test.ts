import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthorizationEngine } from "../services/auth/authz.service";
import type { AuthzContext, User, Session } from "../shared/types";

const { mockDb, enqueueDb, resetDb } = vi.hoisted(() => {
  const results: any[][] = [];
  let idx = 0;

  const next = () => results[idx++] ?? [];

  const makeChain = (): any => {
    const c: any = {};
    c.from = () => c;
    c.where = () => c;
    c.limit = () => Promise.resolve(next());
    c.then = (res: any, rej?: any) => Promise.resolve(next()).then(res, rej);
    return c;
  };

  return {
    mockDb: { select: () => makeChain() },
    enqueueDb: (rows: any[]) => results.push(rows),
    resetDb: () => {
      results.length = 0;
      idx = 0;
    },
  };
});

vi.mock("../db", () => ({ getDb: () => mockDb }));

const mockUser: User = {
  id: "user1",
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
  id: "sess1",
  userId: "user1",
  tokenId: "jti1",
  deviceFingerprint: {
    hash: "h1",
    languages: [],
    isTrusted: true,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  },
  ipAddress: "127.0.0.1",
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

const viewerRole = {
  id: "role-viewer",
  name: "viewer",
  permissions: [{ resource: "documents", actions: ["read"], conditions: [] }],
  parentRoleId: null,
};

const editorRole = {
  id: "role-editor",
  name: "editor",
  permissions: [{ resource: "documents", actions: ["write"], conditions: [] }],
  parentRoleId: null,
};

const engine = new AuthorizationEngine();

describe("AuthorizationEngine", () => {
  beforeEach(() => {
    resetDb();
  });

  it("allows when role has matching permission", async () => {
    enqueueDb([]); // JIT grants (none)
    enqueueDb([viewerRole]); // role by name "viewer"
    enqueueDb([viewerRole]); // role by id in hierarchy traversal

    const result = await engine.evaluate(baseCtx);
    expect(result.decision).toBe("allow");
  });

  it("denies when no matching permission", async () => {
    const usersRole = {
      ...viewerRole,
      permissions: [{ resource: "users", actions: ["read"], conditions: [] }],
    };
    enqueueDb([]);
    enqueueDb([usersRole]);
    enqueueDb([usersRole]);

    const result = await engine.evaluate(baseCtx);
    expect(result.decision).toBe("deny");
  });

  it("allows wildcard action", async () => {
    const wildcardRole = {
      ...viewerRole,
      permissions: [{ resource: "documents", actions: ["*"], conditions: [] }],
    };
    enqueueDb([]);
    enqueueDb([wildcardRole]);
    enqueueDb([wildcardRole]);

    const result = await engine.evaluate({ ...baseCtx, action: "delete" });
    expect(result.decision).toBe("allow");
  });

  it("allows wildcard resource prefix", async () => {
    const wildcardRole = {
      ...viewerRole,
      permissions: [{ resource: "documents:*", actions: ["read"], conditions: [] }],
    };
    enqueueDb([]);
    enqueueDb([wildcardRole]);
    enqueueDb([wildcardRole]);

    const result = await engine.evaluate({ ...baseCtx, resource: "documents:drafts" });
    expect(result.decision).toBe("allow");
  });

  it("evaluates ABAC eq condition — match", async () => {
    const abacRole = {
      ...viewerRole,
      permissions: [
        {
          resource: "documents",
          actions: ["read"],
          conditions: [
            { attribute: "user.attributes.department", operator: "eq", value: "engineering" },
          ],
        },
      ],
    };
    const user = { ...mockUser, attributes: { department: "engineering" } };
    enqueueDb([]);
    enqueueDb([abacRole]);
    enqueueDb([abacRole]);

    const result = await engine.evaluate({ ...baseCtx, user });
    expect(result.decision).toBe("allow");
  });

  it("evaluates ABAC eq condition — no match", async () => {
    const abacRole = {
      ...viewerRole,
      permissions: [
        {
          resource: "documents",
          actions: ["read"],
          conditions: [
            { attribute: "user.attributes.department", operator: "eq", value: "engineering" },
          ],
        },
      ],
    };
    const user = { ...mockUser, attributes: { department: "sales" } };
    enqueueDb([]);
    enqueueDb([abacRole]);
    enqueueDb([abacRole]);

    const result = await engine.evaluate({ ...baseCtx, user });
    expect(result.decision).toBe("deny");
  });

  it("includes JIT-granted roles in evaluation", async () => {
    const jitGrant = {
      id: "jit1",
      userId: "user1",
      roleId: "role-editor",
      status: "approved",
      expiresAt: new Date(Date.now() + 3600000),
    };
    enqueueDb([jitGrant]); // JIT grants
    enqueueDb([{ name: "editor" }]); // role name lookup for JIT roleId
    enqueueDb([viewerRole]); // viewer role by name
    enqueueDb([viewerRole]); // viewer role by id (hierarchy)
    enqueueDb([editorRole]); // editor role by name
    enqueueDb([editorRole]); // editor role by id (hierarchy)

    const result = await engine.evaluate({ ...baseCtx, action: "write" });
    expect(result.decision).toBe("allow");
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
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("SCHEDULE");
  });

  it("handles gte operator in ABAC conditions", async () => {
    const abacRole = {
      ...viewerRole,
      permissions: [
        {
          resource: "documents",
          actions: ["read"],
          conditions: [{ attribute: "user.attributes.clearanceLevel", operator: "gte", value: 2 }],
        },
      ],
    };
    const user = { ...mockUser, attributes: { clearanceLevel: 3 } };
    enqueueDb([]);
    enqueueDb([abacRole]);
    enqueueDb([abacRole]);

    const result = await engine.evaluate({ ...baseCtx, user });
    expect(result.decision).toBe("allow");
  });
});
