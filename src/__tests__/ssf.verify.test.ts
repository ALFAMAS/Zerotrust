import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { verifySSFSignature } from "../ssf/verify";

describe("verifySSFSignature", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    // Direct delete of NODE_ENV (unset case) must not leak into other workers/files.
    if (!process.env.NODE_ENV) process.env.NODE_ENV = "test";
  });

  describe("when SSF_SHARED_SECRET is unset", () => {
    it("rejects unsigned events in production", () => {
      vi.stubEnv("SSF_SHARED_SECRET", "");
      vi.stubEnv("NODE_ENV", "production");
      expect(verifySSFSignature({ type: "compromise" })).toBe(false);
    });

    it("rejects unsigned events in staging", () => {
      vi.stubEnv("SSF_SHARED_SECRET", "");
      vi.stubEnv("NODE_ENV", "staging");
      expect(verifySSFSignature({ type: "compromise" })).toBe(false);
    });

    it("rejects unsigned events when NODE_ENV is unknown", () => {
      vi.stubEnv("SSF_SHARED_SECRET", "");
      vi.stubEnv("NODE_ENV", "preview");
      expect(verifySSFSignature({ type: "compromise" })).toBe(false);
    });

    it("rejects unsigned events when NODE_ENV is empty", () => {
      vi.stubEnv("SSF_SHARED_SECRET", "");
      vi.stubEnv("NODE_ENV", "");
      expect(verifySSFSignature({ type: "compromise" })).toBe(false);
    });

    it("rejects unsigned events when NODE_ENV is unset", () => {
      vi.stubEnv("SSF_SHARED_SECRET", "");
      delete process.env.NODE_ENV;
      expect(verifySSFSignature({ type: "compromise" })).toBe(false);
    });

    it("allows unsigned events in development (local bypass)", () => {
      vi.stubEnv("SSF_SHARED_SECRET", "");
      vi.stubEnv("NODE_ENV", "development");
      expect(verifySSFSignature({ type: "compromise" })).toBe(true);
    });

    it("allows unsigned events in test (local bypass)", () => {
      vi.stubEnv("SSF_SHARED_SECRET", "");
      vi.stubEnv("NODE_ENV", "test");
      expect(verifySSFSignature({ type: "compromise" })).toBe(true);
    });
  });

  describe("when SSF_SHARED_SECRET is configured", () => {
    const secret = "ssf-test-shared-secret";
    const payload = { jti: "evt_1", type: "session-revoked" };

    function sign(body: unknown): string {
      const serialized = typeof body === "string" ? body : JSON.stringify(body);
      return `sha256=${createHmac("sha256", secret).update(serialized).digest("hex")}`;
    }

    it("accepts a valid HMAC signature", () => {
      vi.stubEnv("SSF_SHARED_SECRET", secret);
      vi.stubEnv("NODE_ENV", "production");
      expect(verifySSFSignature(payload, sign(payload))).toBe(true);
    });

    it("rejects a missing signature header", () => {
      vi.stubEnv("SSF_SHARED_SECRET", secret);
      vi.stubEnv("NODE_ENV", "production");
      expect(verifySSFSignature(payload)).toBe(false);
    });

    it("rejects an invalid signature", () => {
      vi.stubEnv("SSF_SHARED_SECRET", secret);
      vi.stubEnv("NODE_ENV", "production");
      expect(verifySSFSignature(payload, "sha256=deadbeef")).toBe(false);
    });

    it("rejects a malformed signature prefix", () => {
      vi.stubEnv("SSF_SHARED_SECRET", secret);
      vi.stubEnv("NODE_ENV", "production");
      expect(verifySSFSignature(payload, "md5=abc")).toBe(false);
    });
  });
});
