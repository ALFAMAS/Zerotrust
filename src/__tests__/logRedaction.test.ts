import { describe, expect, it } from "vitest";
import {
  REDACT_CENSOR,
  isSensitiveLogKey,
  redactLogEntry,
  redactLogString,
} from "../shared/logRedaction";

describe("logRedaction", () => {
  it("flags sensitive key names", () => {
    expect(isSensitiveLogKey("password")).toBe(true);
    expect(isSensitiveLogKey("access_token")).toBe(true);
    expect(isSensitiveLogKey("Authorization")).toBe(true);
    expect(isSensitiveLogKey("Cookie")).toBe(true);
    expect(isSensitiveLogKey("userId")).toBe(false);
  });

  it("redacts nested objects before ES/SIEM fan-out", () => {
    const redacted = redactLogEntry({
      userId: "u1",
      req: {
        headers: {
          authorization: "Bearer secret-token",
          cookie: "za_refresh_token=abc",
        },
      },
      metadata: { refresh_token: "rt-123", note: "ok" },
    });

    expect(redacted.userId).toBe("u1");
    expect(redacted.req).toEqual({
      headers: {
        authorization: REDACT_CENSOR,
        cookie: REDACT_CENSOR,
      },
    });
    expect(redacted.metadata).toEqual({
      refresh_token: REDACT_CENSOR,
      note: "ok",
    });
  });

  it("redacts bearer tokens and password fragments in free-form strings", () => {
    const text = "login failed password=super-secret Bearer eyJhbGciOiJIUzI1NiJ9";
    const redacted = redactLogString(text);
    expect(redacted).not.toContain("super-secret");
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(redacted).toContain(REDACT_CENSOR);
  });
});
