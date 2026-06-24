import { describe, expect, it } from "vitest";
import { corsPolicyFromEnv, resolveCorsOrigin } from "../middleware/cors";

describe("CORS origin policy", () => {
  it("reflects any origin in development when nothing is configured", () => {
    const policy = corsPolicyFromEnv({
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);
    expect(resolveCorsOrigin("https://evil.example", policy)).toBe(
      "https://evil.example",
    );
  });

  it("fails closed in production when no allowlist is configured", () => {
    const policy = corsPolicyFromEnv({
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(resolveCorsOrigin("https://evil.example", policy)).toBeNull();
  });

  it("reflects only allowlisted origins in production", () => {
    const policy = corsPolicyFromEnv({
      NODE_ENV: "production",
      CORS_ALLOWED_ORIGINS:
        "https://app.zerotrust.com, https://admin.zerotrust.com",
    } as NodeJS.ProcessEnv);
    expect(resolveCorsOrigin("https://app.zerotrust.com", policy)).toBe(
      "https://app.zerotrust.com",
    );
    expect(resolveCorsOrigin("https://admin.zerotrust.com", policy)).toBe(
      "https://admin.zerotrust.com",
    );
    expect(resolveCorsOrigin("https://evil.example", policy)).toBeNull();
  });

  it("always trusts APP_URL", () => {
    const policy = corsPolicyFromEnv({
      NODE_ENV: "production",
      APP_URL: "https://dashboard.zerotrust.com/",
    } as NodeJS.ProcessEnv);
    expect(resolveCorsOrigin("https://dashboard.zerotrust.com", policy)).toBe(
      "https://dashboard.zerotrust.com",
    );
    expect(resolveCorsOrigin("https://evil.example", policy)).toBeNull();
  });

  it("honors an explicit wildcard opt-in", () => {
    const policy = corsPolicyFromEnv({
      NODE_ENV: "production",
      CORS_ALLOWED_ORIGINS: "*",
    } as NodeJS.ProcessEnv);
    expect(resolveCorsOrigin("https://anything.example", policy)).toBe("*");
    expect(policy.allowWildcard).toBe(true);
  });

  it("normalizes trailing slashes on both sides", () => {
    const policy = corsPolicyFromEnv({
      NODE_ENV: "production",
      CORS_ALLOWED_ORIGINS: "https://app.zerotrust.com/",
    } as NodeJS.ProcessEnv);
    expect(resolveCorsOrigin("https://app.zerotrust.com", policy)).toBe(
      "https://app.zerotrust.com",
    );
  });
});
