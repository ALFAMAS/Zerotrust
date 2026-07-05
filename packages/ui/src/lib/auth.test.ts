import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  (globalThis as any).window = {
    localStorage,
    document: (globalThis as any).document,
  };
  (globalThis as any).localStorage = localStorage;
  (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true });
  return store;
}

function uninstallBrowser() {
  (globalThis as any).window = undefined;
  (globalThis as any).localStorage = undefined;
  (globalThis as any).document = undefined;
  (globalThis as any).fetch = undefined;
}

describe("auth token helpers (ADR 008 Option C)", () => {
  beforeEach(() => {
    installBrowser();
    vi.resetModules();
  });
  afterEach(() => uninstallBrowser());

  it("stores access token in memory and mirrors cookie for RSC prefetch", async () => {
    const { setToken, getToken, getRefreshToken } = await import("./auth");
    setToken("access-1", "refresh-ignored");
    expect(getToken()).toBe("access-1");
    expect(getRefreshToken()).toBeNull();
    expect((globalThis as any).document.cookie).toContain(
      "za_access_token=access-1",
    );
  });

  it("clearToken clears memory and calls logout with bearer token before wipe", async () => {
    const { setToken, clearToken, getToken } = await import("./auth");
    setToken("a");
    await clearToken();
    expect(getToken()).toBeNull();
    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/logout"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { Authorization: "Bearer a" },
      }),
    );
  });

  it("isAuthenticated reflects in-memory access token", async () => {
    const { setToken, clearToken, isAuthenticated } = await import("./auth");
    expect(isAuthenticated()).toBe(false);
    setToken("a");
    expect(isAuthenticated()).toBe(true);
    await clearToken();
    expect(isAuthenticated()).toBe(false);
  });

  it("hydrates access token from the RSC mirror cookie after a full reload", async () => {
    const { setToken, getToken, isAuthenticated } = await import("./auth");
    setToken("access-from-login");
    expect(getToken()).toBe("access-from-login");

    vi.resetModules();
    const reloaded = await import("./auth");
    expect(reloaded.getToken()).toBe("access-from-login");
    expect(reloaded.isAuthenticated()).toBe(true);
  });

  it("bootstrapAccessToken reuses the mirror cookie before calling refresh", async () => {
    const { setToken } = await import("./auth");
    setToken("cookie-only-access");
    vi.resetModules();
    const reloaded = await import("./auth");
    await expect(reloaded.bootstrapAccessToken()).resolves.toBe(
      "cookie-only-access",
    );
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
  });

  it("bootstrapAccessToken refreshes when memory and mirror cookie are absent", async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: "refreshed-access" }),
    });
    const { bootstrapAccessToken, getToken } = await import("./auth");
    await expect(bootstrapAccessToken()).resolves.toBe("refreshed-access");
    expect(getToken()).toBe("refreshed-access");
    expect((globalThis as any).fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/token/refresh"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("is SSR-safe: returns null / false when window is undefined", async () => {
    uninstallBrowser();
    vi.resetModules();
    const { getToken, getRefreshToken, isAuthenticated } =
      await import("./auth");
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
});
