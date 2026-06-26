import { describe, expect, it, vi, afterEach } from "vitest";
import { safeExternalRedirect, safeRelativeRedirect } from "./safeRedirect";

describe("UI safeRedirect", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows same-origin relative redirects", () => {
    expect(safeRelativeRedirect("/dashboard?tab=billing", "/fallback")).toBe(
      "/dashboard?tab=billing"
    );
  });

  it("rejects absolute and protocol-relative relative redirects", () => {
    expect(safeRelativeRedirect("https://evil.example", "/fallback")).toBe("/fallback");
    expect(safeRelativeRedirect("//evil.example", "/fallback")).toBe("/fallback");
    expect(safeRelativeRedirect("/\\evil.example", "/fallback")).toBe("/fallback");
  });

  it("allows known provider redirects", () => {
    expect(safeExternalRedirect("https://checkout.stripe.com/c/pay/cs_test")).toBe(
      "https://checkout.stripe.com/c/pay/cs_test"
    );
    expect(safeExternalRedirect("https://accounts.google.com/o/oauth2/v2/auth")).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
  });

  it("rejects javascript URLs and unconfigured external hosts", () => {
    expect(safeExternalRedirect("javascript:alert(1)")).toBeNull();
    expect(safeExternalRedirect("https://evil.example/phish")).toBeNull();
  });

  it("allows operator-configured external redirect hosts", () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOWED_EXTERNAL_REDIRECT_HOSTS", "pay.example.com");
    expect(safeExternalRedirect("https://pay.example.com/checkout")).toBe(
      "https://pay.example.com/checkout"
    );
  });
});
