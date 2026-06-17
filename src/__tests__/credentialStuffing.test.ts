import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Lower the thresholds so the test is fast and deterministic. Env is read at
// module load, so set it before importing the module under test.
process.env.CRED_STUFF_MAX_FAILURES = "5";
process.env.CRED_STUFF_MAX_ACCOUNTS = "3";
process.env.CRED_STUFF_BLOCK_MS = "60000";

async function load() {
  vi.resetModules();
  return import("../middleware/credentialStuffing");
}

describe("credential-stuffing defense", () => {
  let mod: Awaited<ReturnType<typeof load>>;

  beforeEach(async () => {
    mod = await load();
    mod.clearCredentialStuffing();
  });

  it("does not block under the thresholds", () => {
    mod.recordIpLoginFailure("1.2.3.4", "a@test.com");
    mod.recordIpLoginFailure("1.2.3.4", "a@test.com");
    expect(mod.isIpBlocked("1.2.3.4").blocked).toBe(false);
  });

  it("blocks an IP that exceeds the raw failure velocity", () => {
    for (let i = 0; i < 5; i++) mod.recordIpLoginFailure("9.9.9.9", "same@test.com");
    const res = mod.isIpBlocked("9.9.9.9");
    expect(res.blocked).toBe(true);
    expect(res.retryAfterSecs).toBeGreaterThan(0);
  });

  it("blocks sooner when many distinct accounts are targeted (stuffing signal)", () => {
    // Only 3 failures, but across 3 distinct accounts → trips the accounts threshold.
    mod.recordIpLoginFailure("8.8.8.8", "a@test.com");
    mod.recordIpLoginFailure("8.8.8.8", "b@test.com");
    mod.recordIpLoginFailure("8.8.8.8", "c@test.com");
    expect(mod.isIpBlocked("8.8.8.8").blocked).toBe(true);
  });

  it("isolates IPs from one another", () => {
    for (let i = 0; i < 5; i++) mod.recordIpLoginFailure("9.9.9.9", "x@test.com");
    expect(mod.isIpBlocked("9.9.9.9").blocked).toBe(true);
    expect(mod.isIpBlocked("7.7.7.7").blocked).toBe(false);
  });

  it("a success clears a not-yet-blocked IP's record", () => {
    mod.recordIpLoginFailure("5.5.5.5", "a@test.com");
    mod.recordIpLoginSuccess("5.5.5.5");
    // After clearing, two more failures shouldn't be near the threshold.
    mod.recordIpLoginFailure("5.5.5.5", "a@test.com");
    expect(mod.isIpBlocked("5.5.5.5").blocked).toBe(false);
  });

  it("never lifts an active block on success", () => {
    for (let i = 0; i < 5; i++) mod.recordIpLoginFailure("9.9.9.9", "x@test.com");
    mod.recordIpLoginSuccess("9.9.9.9");
    expect(mod.isIpBlocked("9.9.9.9").blocked).toBe(true);
  });

  it("treats an empty IP as a no-op (never blocks)", () => {
    for (let i = 0; i < 10; i++) mod.recordIpLoginFailure("", "x@test.com");
    expect(mod.isIpBlocked("").blocked).toBe(false);
  });
});
