import { describe, it, expect, beforeAll } from "vitest";
import { TokenService } from "../services/token.service";
import { encrypt } from "../crypto/paseto-v4";

const SECRET_HEX = "a".repeat(64);
const SESSION_CONFIG = {
  defaultTTL: 3600,
  refreshTokenTTL: 604800,
  maxConcurrentDevices: 5,
};

let svc: TokenService;

beforeAll(async () => {
  svc = new TokenService(SECRET_HEX, SESSION_CONFIG);
  await svc.init();
});

describe("TokenService", () => {
  it("issues and verifies a valid access token", async () => {
    const token = await svc.signAccessToken({
      sub: "user1",
      email: "u@test.com",
      aud: "zerotrust",
      scope: ["openid"],
    });
    expect(token).toMatch(/^v4\.local\./);

    const payload = await svc.verifyAccessToken(token);
    expect(payload.sub).toBe("user1");
    expect(payload.email).toBe("u@test.com");
    expect(payload.jti).toBeTruthy();
    expect(payload.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("includes jti in every token for single-use enforcement", async () => {
    const t1 = await svc.signAccessToken({
      sub: "u",
      email: "u@test.com",
      aud: "a",
      scope: [],
    });
    const t2 = await svc.signAccessToken({
      sub: "u",
      email: "u@test.com",
      aud: "a",
      scope: [],
    });
    const p1 = await svc.verifyAccessToken(t1);
    const p2 = await svc.verifyAccessToken(t2);
    expect(p1.jti).not.toBe(p2.jti);
  });

  it("respects custom TTL", async () => {
    const ttl = 60;
    const token = await svc.signAccessToken(
      { sub: "u", email: "u@test.com", aud: "a", scope: [] },
      ttl,
    );
    const payload = await svc.verifyAccessToken(token);
    expect(payload.exp - payload.iat).toBe(ttl);
  });

  it("throws TOKEN_EXPIRED on expired token", async () => {
    const token = await svc.signAccessToken(
      { sub: "u", email: "u@test.com", aud: "a", scope: [] },
      -1,
    );
    await expect(svc.verifyAccessToken(token)).rejects.toThrow("TOKEN_EXPIRED");
  });

  it("throws TOKEN_INVALID on tampered payload", async () => {
    const token = await svc.signAccessToken({
      sub: "u",
      email: "u@test.com",
      aud: "a",
      scope: [],
    });
    const tampered = token.slice(0, -5) + "XXXXX";
    await expect(svc.verifyAccessToken(tampered)).rejects.toThrow();
  });

  it("throws TOKEN_INVALID on wrong format", async () => {
    await expect(svc.verifyAccessToken("not.a.valid.token")).rejects.toThrow(
      "TOKEN_INVALID",
    );
  });

  it("throws TOKEN_INVALID on an authenticated token whose payload is not valid JSON", async () => {
    // Forge an otherwise-valid v4.local token (same key) carrying non-JSON bytes.
    const key = new Uint8Array(SECRET_HEX.length / 2);
    for (let i = 0; i < SECRET_HEX.length; i += 2)
      key[i / 2] = parseInt(SECRET_HEX.substr(i, 2), 16);
    const token = encrypt(key, new TextEncoder().encode("not json"));
    await expect(svc.verifyAccessToken(token)).rejects.toThrow("TOKEN_INVALID");
  });

  it("throws TOKEN_INVALID when the payload lacks a numeric exp", async () => {
    const key = new Uint8Array(SECRET_HEX.length / 2);
    for (let i = 0; i < SECRET_HEX.length; i += 2)
      key[i / 2] = parseInt(SECRET_HEX.substr(i, 2), 16);
    const token = encrypt(
      key,
      new TextEncoder().encode(JSON.stringify({ sub: "u" })),
    );
    await expect(svc.verifyAccessToken(token)).rejects.toThrow("TOKEN_INVALID");
  });

  it("issues a random refresh token of expected length", async () => {
    const rt = await svc.signRefreshToken();
    expect(typeof rt).toBe("string");
    expect(rt.length).toBe(96);
    const rt2 = await svc.signRefreshToken();
    expect(rt).not.toBe(rt2);
  });

  it("stores pop_key in token payload", async () => {
    const token = await svc.signAccessToken({
      sub: "u",
      email: "u@test.com",
      aud: "a",
      scope: [],
      pop_key: "my-public-key",
    });
    const payload = await svc.verifyAccessToken(token);
    expect(payload.pop_key).toBe("my-public-key");
  });
});
