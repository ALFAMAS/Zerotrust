import { describe, expect, it } from "vitest";
import { corsPolicyFromEnv, resolveCorsOrigin } from "../middleware/cors";

describe("CORS origin policy", () => {
  it("reflects any origin in development when nothing is configured", () => {
    const policy = corsPolicyFromEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
    expect(resolveCorsOrigin("https://evil.example", policy)).toBe("https://evil.example");
  });

  it("fails closed in production when no allowlist is configured", () => {
    const policy = corsPolicyFromEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(resolveCorsOrigin("https://evil.example", policy)).toBeNull();
  });

  it("reflects only allowlisted origins in production", () => {
    const policy = corsPolicyFromEnv({
      NODE_ENV: "production",
      CORS_ALLOWED_ORIGINS: "https://app.zeroauth.com, https://admin.zeroauth.com",
    } as NodeJS.ProcessEnv);
    expect(resolveCorsOrigin("https://app.zeroauth.com", policy)).toBe("https://app.zeroauth.com");
    expect(resolveCorsOrigin("https://admin.zeroauth.com", policy)).toBe(
      "https://admin.zeroauth.com"
    );
    expect(resolveCorsOrigin("https://evil.example", policy)).toBeNull();
  });

  it("always trusts APP_URL", () => {
    const policy = corsPolicyFromEnv({
      NODE_ENV: "production",
      APP_URL: "https://dashboard.zeroauth.com/",
    } as NodeJS.ProcessEnv);
    expect(resolveCorsOrigin("https://dashboard.zeroauth.com", policy)).toBe(
      "https://dashboard.zeroauth.com"
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
      CORS_ALLOWED_ORIGINS: "https://app.zeroauth.com/",
    } as NodeJS.ProcessEnv);
    expect(resolveCorsOrigin("https://app.zeroauth.com", policy)).toBe("https://app.zeroauth.com");
  });
});
