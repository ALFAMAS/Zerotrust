import { describe, it, expect } from "vitest";
import {
  evaluateSessionPolicy,
  type EffectiveSessionPolicy,
} from "../services/sessionPolicy.service";

const NOW = 1_800_000_000_000; // fixed clock for deterministic assertions

const base: EffectiveSessionPolicy = {
  maxSessionAgeSeconds: 0,
  idleTimeoutSeconds: 0,
  maxConcurrentSessions: 0,
  countryLists: [],
};

const session = (over: Partial<{ createdAt: number; lastActivityAt: number; country: string | null }>) => ({
  createdAt: new Date(over.createdAt ?? NOW),
  lastActivityAt: new Date(over.lastActivityAt ?? NOW),
  country: over.country ?? null,
});

describe("evaluateSessionPolicy", () => {
  it("allows when no limits are configured", () => {
    expect(evaluateSessionPolicy(session({}), base, NOW)).toEqual({ allowed: true });
  });

  it("blocks a session older than the max age", () => {
    const policy = { ...base, maxSessionAgeSeconds: 3600 };
    const old = session({ createdAt: NOW - 3601 * 1000 });
    expect(evaluateSessionPolicy(old, policy, NOW)).toEqual({ allowed: false, reason: "SESSION_MAX_AGE" });
  });

  it("allows a session within the max age", () => {
    const policy = { ...base, maxSessionAgeSeconds: 3600 };
    const fresh = session({ createdAt: NOW - 60 * 1000 });
    expect(evaluateSessionPolicy(fresh, policy, NOW)).toEqual({ allowed: true });
  });

  it("blocks an idle session past the timeout", () => {
    const policy = { ...base, idleTimeoutSeconds: 900 };
    const idle = session({ lastActivityAt: NOW - 901 * 1000 });
    expect(evaluateSessionPolicy(idle, policy, NOW)).toEqual({ allowed: false, reason: "SESSION_IDLE_TIMEOUT" });
  });

  it("blocks a country not in the allowlist", () => {
    const policy = { ...base, countryLists: [["US", "GB"]] };
    expect(evaluateSessionPolicy(session({ country: "FR" }), policy, NOW)).toEqual({
      allowed: false,
      reason: "SESSION_COUNTRY_BLOCKED",
    });
  });

  it("allows a country present in every org's allowlist", () => {
    const policy = { ...base, countryLists: [["US", "GB"], ["GB", "DE"]] };
    expect(evaluateSessionPolicy(session({ country: "GB" }), policy, NOW)).toEqual({ allowed: true });
  });

  it("blocks a country missing from one org's allowlist (intersection semantics)", () => {
    const policy = { ...base, countryLists: [["US", "GB"], ["GB", "DE"]] };
    expect(evaluateSessionPolicy(session({ country: "US" }), policy, NOW)).toEqual({
      allowed: false,
      reason: "SESSION_COUNTRY_BLOCKED",
    });
  });

  it("does not block when the session country is unknown (avoids false lockout)", () => {
    const policy = { ...base, countryLists: [["US"]] };
    expect(evaluateSessionPolicy(session({ country: null }), policy, NOW)).toEqual({ allowed: true });
  });
});
