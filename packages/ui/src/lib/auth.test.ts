import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// auth.ts guards every call with `typeof window === "undefined"`, so to exercise
// the real logic we install a minimal window + localStorage in the node test
// environment.
function installBrowser() {
  const store = new Map<string, string>();
  let cookie = "";
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  (globalThis as any).document = {
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      cookie = value;
    },
  };
  (globalThis as any).window = { localStorage, document: (globalThis as any).document };
  (globalThis as any).localStorage = localStorage;
  return store;
}

function uninstallBrowser() {
  (globalThis as any).window = undefined;
  (globalThis as any).localStorage = undefined;
  (globalThis as any).document = undefined;
}

describe("auth token helpers", () => {
  beforeEach(() => {
    installBrowser();
    vi.resetModules();
  });
  afterEach(() => uninstallBrowser());

  it("stores and reads back the access + refresh tokens", async () => {
    const { setToken, getToken, getRefreshToken } = await import("./auth");
    setToken("access-1", "refresh-1");
    expect(getToken()).toBe("access-1");
    expect(getRefreshToken()).toBe("refresh-1");
    expect((globalThis as any).document.cookie).toContain("za_access_token=access-1");
  });

  it("setToken without a refresh token leaves the access token only", async () => {
    const { setToken, getToken, getRefreshToken } = await import("./auth");
    setToken("access-only");
    expect(getToken()).toBe("access-only");
    expect(getRefreshToken()).toBeNull();
  });

  it("clearToken removes BOTH tokens (no refresh token left behind on logout)", async () => {
    const { setToken, clearToken, getToken, getRefreshToken } = await import("./auth");
    setToken("a", "r");
    clearToken();
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("isAuthenticated reflects access-token presence", async () => {
    const { setToken, clearToken, isAuthenticated } = await import("./auth");
    expect(isAuthenticated()).toBe(false);
    setToken("a");
    expect(isAuthenticated()).toBe(true);
    clearToken();
    expect(isAuthenticated()).toBe(false);
  });

  it("is SSR-safe: returns null / false when window is undefined", async () => {
    uninstallBrowser();
    vi.resetModules();
    const { getToken, getRefreshToken, isAuthenticated } = await import("./auth");
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
});
