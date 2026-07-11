import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

describe("postAuthSecurity wiring", () => {
  const originalDevice = process.env.DEVICE_ATTESTATION_ENABLED;
  const originalEval = process.env.CONTINUOUS_EVAL_ENABLED;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.DEVICE_ATTESTATION_ENABLED;
    delete process.env.CONTINUOUS_EVAL_ENABLED;
  });

  afterEach(() => {
    if (originalDevice === undefined) delete process.env.DEVICE_ATTESTATION_ENABLED;
    else process.env.DEVICE_ATTESTATION_ENABLED = originalDevice;
    if (originalEval === undefined) delete process.env.CONTINUOUS_EVAL_ENABLED;
    else process.env.CONTINUOUS_EVAL_ENABLED = originalEval;
  });

  it("registers no middleware when env flags are unset", async () => {
    const { initPostAuthSecurity, isPostAuthSecurityEnabled } = await import(
      "../middleware/postAuthSecurity"
    );
    initPostAuthSecurity();
    expect(isPostAuthSecurityEnabled()).toBe(false);
  });

  it("registers device attestation when DEVICE_ATTESTATION_ENABLED=true", async () => {
    process.env.DEVICE_ATTESTATION_ENABLED = "true";
    const { initPostAuthSecurity, isPostAuthSecurityEnabled } = await import(
      "../middleware/postAuthSecurity"
    );
    initPostAuthSecurity();
    expect(isPostAuthSecurityEnabled()).toBe(true);
  });

  it("registers continuous eval when CONTINUOUS_EVAL_ENABLED=true", async () => {
    process.env.CONTINUOUS_EVAL_ENABLED = "true";
    const { initPostAuthSecurity, isPostAuthSecurityEnabled } = await import(
      "../middleware/postAuthSecurity"
    );
    initPostAuthSecurity();
    expect(isPostAuthSecurityEnabled()).toBe(true);
  });
});

describe("job registry — auth.apiKeyRotation", () => {
  it("includes the daily API key rotation job", async () => {
    const { JOB_REGISTRY } = await import("../jobs/registry");
    const job = JOB_REGISTRY.find((entry) => entry.name === "auth.apiKeyRotation");
    expect(job).toBeDefined();
    expect(job?.intervalHours).toBe(24);
    expect(job?.singleInstance).toBe(true);
  });
});
