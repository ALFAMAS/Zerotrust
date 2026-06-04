import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateUnsubscribeToken, verifyUnsubscribeToken } from "../services/unsubscribe";

describe("Unsubscribe token service", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("generates a valid token that verifies successfully", () => {
    const token = generateUnsubscribeToken("user-123", "notification");
    const result = verifyUnsubscribeToken(token);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe("user-123");
    expect(result?.emailType).toBe("notification");
  });

  it("returns null for a tampered token", () => {
    const token = generateUnsubscribeToken("user-123", "notification");
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("returns null for a token with wrong signature", () => {
    const token = generateUnsubscribeToken("user-123", "notification");
    const parts = token.split(".");
    const bad = `${parts[0]}.invalidsignature`;
    expect(verifyUnsubscribeToken(bad)).toBeNull();
  });

  it("returns null for a completely invalid token", () => {
    expect(verifyUnsubscribeToken("not-a-token")).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
  });

  it("generates different tokens for different email types", () => {
    const t1 = generateUnsubscribeToken("user-1", "notification");
    const t2 = generateUnsubscribeToken("user-1", "marketing");
    expect(t1).not.toBe(t2);
    expect(verifyUnsubscribeToken(t1)?.emailType).toBe("notification");
    expect(verifyUnsubscribeToken(t2)?.emailType).toBe("marketing");
  });

  it("respects UNSUBSCRIBE_SECRET env var", () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "secret-a");
    const token = generateUnsubscribeToken("user-1", "all");

    vi.stubEnv("UNSUBSCRIBE_SECRET", "secret-b");
    expect(verifyUnsubscribeToken(token)).toBeNull();

    vi.stubEnv("UNSUBSCRIBE_SECRET", "secret-a");
    expect(verifyUnsubscribeToken(token)).not.toBeNull();
  });
});
