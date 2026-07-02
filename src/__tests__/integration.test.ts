import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";

vi.mock("mongoose", () => {
  const Schema: any = function (definition: any, opts?: any) {
    this.definition = definition;
    this.options = opts;
    this.indexes = [];
    this.plugins = [];
    this.pre = vi.fn().mockReturnThis();
    this.post = vi.fn().mockReturnThis();
    this.plugin = vi.fn().mockReturnThis();
    this.index = vi.fn().mockReturnThis();
  };
  Schema.Types = { ObjectId: "ObjectId", Mixed: "Mixed" };

  const mockDoc = (data: Record<string, any>) => ({
    ...data,
    _id: data._id || "mock-id",
    toObject: () => ({ ...data, _id: data._id || "mock-id" }),
    save: vi.fn().mockResolvedValue(true),
  });

  const makeModel = (name: string) => {
    const docs: any[] = [];
    return {
      create: vi
        .fn()
        .mockImplementation((data: any) => Promise.resolve(mockDoc(data))),
      findOne: vi.fn().mockResolvedValue(null),
      findById: vi.fn().mockResolvedValue(null),
      findByIdAndUpdate: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      countDocuments: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    };
  };

  return {
    default: {
      model: vi.fn().mockImplementation((name: string) => makeModel(name)),
      Schema,
      connect: vi.fn().mockResolvedValue({}),
    },
    Schema,
    Document: class {},
  };
});

vi.mock("../config", () => ({
  getConfig: () => ({
    session: {
      defaultTTL: 3600,
      refreshTokenTTL: 604800,
      maxConcurrentDevices: 5,
    },
    security: {
      bcryptRounds: 4,
      tokenSecretHex: "a".repeat(64),
      csfleMasterKeyHex: "b".repeat(64),
      csflekeyRotationIntervalDays: 90,
    },
    rateLimiting: { enabled: false, perIpLimit: 100, windowSecs: 60 },
    geofencing: { enabled: false, allowedCountries: [], allowedIpRanges: [] },
    mfa: {
      totpWindow: 1,
      otpExpirySecs: 900,
      maxOTPAttempts: 5,
      channels: {
        email: { enabled: true },
        telegram: { enabled: false, botToken: "" },
      },
    },
    oauth: { providers: {} },
    elasticsearch: {
      enabled: false,
      host: "localhost",
      port: 9200,
      indexPrefix: "zerotrust",
    },
    logging: { level: "error", format: "json" },
  }),
  resetConfig: vi.fn(),
}));

describe("Integration: Auth flow (mocked DB)", () => {
  let UserModel: any;
  let SessionModel: any;
  let RefreshTokenModel: any;
  let TokenService: any;

  beforeAll(async () => {
    const models = await import("../models");
    UserModel = models.UserModel;
    SessionModel = models.SessionModel;
    RefreshTokenModel = models.RefreshTokenModel;

    const ts = await import("../services/auth/token.service");
    TokenService = ts.TokenService;
  });

  it("TokenService init succeeds", async () => {
    const svc = new TokenService("a".repeat(64), {
      defaultTTL: 3600,
      refreshTokenTTL: 604800,
      maxConcurrentDevices: 5,
    });
    await expect(svc.init()).resolves.toBeUndefined();
  });

  it("issues access and refresh tokens independently", async () => {
    const svc = new TokenService("a".repeat(64), {
      defaultTTL: 3600,
      refreshTokenTTL: 604800,
      maxConcurrentDevices: 5,
    });
    await svc.init();
    const access = await svc.signAccessToken({
      sub: "u1",
      email: "u@t.com",
      aud: "za",
      scope: [],
    });
    const refresh = await svc.signRefreshToken();
    expect(access).toMatch(/^v4\.local\./);
    expect(refresh.length).toBeGreaterThan(0);
  });

  it("verifies valid access token after issue", async () => {
    const svc = new TokenService("a".repeat(64), {
      defaultTTL: 3600,
      refreshTokenTTL: 604800,
      maxConcurrentDevices: 5,
    });
    await svc.init();
    const access = await svc.signAccessToken({
      sub: "u1",
      email: "u@t.com",
      aud: "za",
      scope: [],
    });
    const payload = await svc.verifyAccessToken(access);
    expect(payload.sub).toBe("u1");
  });
});

describe("Integration: Rate limiter", () => {
  it("in-memory limiter allows requests within limit", async () => {
    const { consumeInMemory, clearInMemoryBuckets } =
      await import("../services/shared/rateLimiter/inmemory");
    clearInMemoryBuckets();
    const key = "test-ip-int-" + Date.now();
    const r1 = consumeInMemory(key, 1, 10, 60);
    expect(r1.allowed).toBe(true);
  });

  it("in-memory limiter blocks requests over limit", async () => {
    const { consumeInMemory, clearInMemoryBuckets } =
      await import("../services/shared/rateLimiter/inmemory");
    clearInMemoryBuckets();
    const key = "test-ip-block-" + Date.now();
    for (let i = 0; i < 3; i++) consumeInMemory(key, 1, 3, 60);
    const result = consumeInMemory(key, 1, 3, 60);
    expect(result.allowed).toBe(false);
  });
});

describe("Integration: CSFLE encrypt/decrypt", () => {
  it("encrypts and decrypts correctly with mocked config", async () => {
    const { initializeCSFLE, resetCSFLE } = await import("../crypto/csfle");
    resetCSFLE();

    const manager = await initializeCSFLE({
      security: {
        csfleMasterKeyHex: "c".repeat(64),
        csflekeyRotationIntervalDays: 90,
      },
    } as any);

    const plain = "integration-test@example.com";
    const { ciphertext, keyVersion, iv } = await manager.encrypt(plain);
    const decrypted = await manager.decrypt(ciphertext, keyVersion, iv);
    expect(decrypted).toBe(plain);
    resetCSFLE();
  });
});
