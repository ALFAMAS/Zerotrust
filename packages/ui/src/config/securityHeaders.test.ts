import { describe, expect, it, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("UI security headers config", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.UI_CSP;
    delete process.env.UI_CSP_REPORT_ONLY;
    delete process.env.UI_CSP_REPORT_URI;
    delete process.env.NEXT_PUBLIC_ZEROTRUST_URL;
    delete process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("builds default CSP with API connect-src and frame denial", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_ZEROTRUST_URL = "http://localhost:1337";

    const { buildUiSecurityHeaders } = await import("../config/securityHeaders");
    const headers = buildUiSecurityHeaders();
    const csp = headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("http://localhost:1337");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(headers.some((h) => h.key === "X-Frame-Options" && h.value === "DENY")).toBe(true);
    expect(headers.some((h) => h.key === "Strict-Transport-Security")).toBe(true);
  });

  it("allows unsafe-eval in development for Next.js HMR", async () => {
    process.env.NODE_ENV = "development";

    const { buildUiSecurityHeaders } = await import("../config/securityHeaders");
    const headers = buildUiSecurityHeaders();
    const csp = headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
    expect(headers.some((h) => h.key === "Strict-Transport-Security")).toBe(false);
  });

  it("honors UI_CSP override", async () => {
    process.env.UI_CSP = "default-src 'none'";

    const { buildUiSecurityHeaders } = await import("../config/securityHeaders");
    const headers = buildUiSecurityHeaders();
    const csp = headers.find((h) => h.key === "Content-Security-Policy")?.value;

    expect(csp).toBe("default-src 'none'");
  });

  it("uses report-only header when UI_CSP_REPORT_ONLY=true", async () => {
    process.env.UI_CSP_REPORT_ONLY = "true";

    const { buildUiSecurityHeaders } = await import("../config/securityHeaders");
    const headers = buildUiSecurityHeaders();

    expect(headers.some((h) => h.key === "Content-Security-Policy-Report-Only")).toBe(true);
    expect(headers.some((h) => h.key === "Content-Security-Policy")).toBe(false);
  });
});
