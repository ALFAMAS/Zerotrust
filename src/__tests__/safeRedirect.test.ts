import { describe, expect, it } from "vitest";
import { appRedirectUrl, safeRelativeRedirect } from "../shared/safeRedirect";

describe("safeRelativeRedirect", () => {
  it("allows same-origin relative paths", () => {
    expect(safeRelativeRedirect("/dashboard?tab=settings", "/fallback")).toBe(
      "/dashboard?tab=settings"
    );
  });

  it("rejects absolute, protocol-relative, backslash, and control-character redirects", () => {
    expect(safeRelativeRedirect("https://evil.example", "/fallback")).toBe("/fallback");
    expect(safeRelativeRedirect("//evil.example", "/fallback")).toBe("/fallback");
    expect(safeRelativeRedirect("/\\evil.example", "/fallback")).toBe("/fallback");
    expect(safeRelativeRedirect("/dashboard\nLocation:https://evil.example", "/fallback")).toBe(
      "/fallback"
    );
  });
});

describe("appRedirectUrl", () => {
  it("combines a trusted app origin with a safe relative path", () => {
    expect(appRedirectUrl("/login?oauth_code=abc", "https://app.example")).toBe(
      "https://app.example/login?oauth_code=abc"
    );
  });

  it("falls back when the path is attacker-controlled", () => {
    expect(appRedirectUrl("//evil.example", "https://app.example", "/login")).toBe(
      "https://app.example/login"
    );
  });

  it("falls back when the configured app origin is not http(s)", () => {
    expect(appRedirectUrl("/login", "javascript:alert(1)")).toBe("http://localhost:3000/login");
  });
});
