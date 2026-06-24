import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { initializeCSFLE, getCSFLE, resetCSFLE } from "../crypto/csfle";

const MASTER_KEY_HEX = "b".repeat(64);

const mockConfig = {
  database: { mongoUri: "", connectionPoolSize: 1 },
  session: {
    defaultTTL: 3600,
    refreshTokenTTL: 604800,
    maxConcurrentDevices: 5,
  },
  security: {
    bcryptRounds: 10,
    tokenSecretHex: "a".repeat(64),
    csfleMasterKeyHex: MASTER_KEY_HEX,
    csflekeyRotationIntervalDays: 90,
  },
  oauth: { providers: {} },
  mfa: {
    totpWindow: 1,
    otpExpirySecs: 900,
    maxOTPAttempts: 5,
    channels: {
      email: { enabled: true },
      sms: { enabled: false, provider: "twilio" },
      whatsapp: { enabled: false, provider: "twilio" },
      telegram: { enabled: false, botToken: "" },
    },
  },
  rateLimiting: { enabled: false, perIpLimit: 100, windowSecs: 60 },
  geofencing: { enabled: false, allowedCountries: [], allowedIpRanges: [] },
  elasticsearch: {
    enabled: false,
    host: "localhost",
    port: 9200,
    indexPrefix: "zerotrust",
  },
  logging: { level: "info" as const, format: "json" as const },
} as any;

describe("CSFLE", () => {
  afterEach(() => resetCSFLE());

  it("initializes and encrypts/decrypts round-trip", async () => {
    const manager = await initializeCSFLE(mockConfig);
    const plaintext = "sensitive-email@example.com";
    const { ciphertext, keyVersion, iv } = await manager.encrypt(plaintext);

    expect(ciphertext).toBeTruthy();
    expect(ciphertext).not.toContain(plaintext);

    const decrypted = await manager.decrypt(ciphertext, keyVersion, iv);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext (probabilistic encryption)", async () => {
    const manager = await initializeCSFLE(mockConfig);
    const plaintext = "hello@test.com";
    const r1 = await manager.encrypt(plaintext);
    const r2 = await manager.encrypt(plaintext);
    expect(r1.ciphertext).not.toBe(r2.ciphertext);
  });

  it("rotates keys and can decrypt old ciphertext", async () => {
    const manager = await initializeCSFLE(mockConfig);
    const plaintext = "before-rotation";
    const { ciphertext, keyVersion, iv } = await manager.encrypt(plaintext);

    await manager.rotateKeys();

    const decrypted = await manager.decrypt(ciphertext, keyVersion, iv);
    expect(decrypted).toBe(plaintext);
  });

  it("rotates keys and new key is default for new encryptions", async () => {
    const manager = await initializeCSFLE(mockConfig);
    const { keyVersion: v1 } = await manager.encrypt("before");
    await manager.rotateKeys();
    const { keyVersion: v2 } = await manager.encrypt("after");
    expect(v1).not.toBe(v2);
  });

  it("throws on unknown key version during decrypt", async () => {
    const manager = await initializeCSFLE(mockConfig);
    await expect(
      manager.decrypt("fakecipher", "unknown-version", "fakeiv"),
    ).rejects.toThrow();
  });

  it("returns singleton from getCSFLE after init", async () => {
    const m1 = await initializeCSFLE(mockConfig);
    const m2 = getCSFLE();
    expect(m1).toBe(m2);
  });

  it("detects key rotation due based on interval", async () => {
    const shortRotationConfig = {
      ...mockConfig,
      security: { ...mockConfig.security, csflekeyRotationIntervalDays: 0 },
    };
    const manager = await initializeCSFLE(shortRotationConfig);
    expect(manager.isKeyRotationDue()).toBe(true);
  });

  it("lists all key versions", async () => {
    const manager = await initializeCSFLE(mockConfig);
    const versions = manager.getKeyVersions();
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].isActive).toBe(true);
  });
});
