import { describe, it, expect } from "vitest";
import { FingerprintService } from "../services/auth/fingerprint.service";

describe("FingerprintService", () => {
  it("computes stable hash for same input", () => {
    const input = {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      ip: "127.0.0.1",
      acceptLanguage: "en-US,en;q=0.9",
      screenResolution: "1920x1080",
      timezone: "UTC",
    };

    const a = FingerprintService.compute(input as any);
    const b = FingerprintService.compute(input as any);
    expect(a.hash).toBe(b.hash);
    expect(a.browser.length).toBeGreaterThan(0);
    expect(a.os.length).toBeGreaterThan(0);
  });

  it("extracts fingerprint from request headers", () => {
    const req = {
      headers: {
        "user-agent": "UA/1.0",
        "accept-language": "en-US",
        "x-screen-resolution": "1024x768",
        "x-timezone": "UTC",
        "x-platform": "web",
        "x-forwarded-for": "203.0.113.1",
      },
      ip: undefined,
    } as any;

    const out = FingerprintService.extractFromRequest(req);
    expect(out.userAgent).toBe("UA/1.0");
    expect(out.ip).toBe("203.0.113.1");
    expect(out.screenResolution).toBe("1024x768");
  });
});
