import { describe, expect, it } from "vitest";
import { enforceProductionApiUrl, isLocalhostApiUrl, normalizeApiUrl } from "./publicApiUrl";

describe("publicApiUrl", () => {
  it("normalizeApiUrl strips trailing slash", () => {
    expect(normalizeApiUrl("https://api.example.com/")).toBe("https://api.example.com");
    expect(normalizeApiUrl(undefined)).toBe("");
  });

  it("isLocalhostApiUrl detects loopback hosts", () => {
    expect(isLocalhostApiUrl("http://localhost:1337")).toBe(true);
    expect(isLocalhostApiUrl("http://127.0.0.1:1337")).toBe(true);
    expect(isLocalhostApiUrl("https://api.example.com")).toBe(false);
  });

  it("enforceProductionApiUrl rejects unset and localhost URLs", () => {
    expect(() => enforceProductionApiUrl(undefined)).toThrow(/must be set/);
    expect(() => enforceProductionApiUrl("http://localhost:1337")).toThrow(/localhost/);
  });

  it("enforceProductionApiUrl accepts public API URLs", () => {
    expect(() => enforceProductionApiUrl("https://api.example.com")).not.toThrow();
    expect(() => enforceProductionApiUrl("http://api.staging.example.com")).not.toThrow();
  });
});
