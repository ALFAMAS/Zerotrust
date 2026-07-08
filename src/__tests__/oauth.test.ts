import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("../../src/logger/index.js", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../../src/config/index.js", () => ({
  getConfig: () => ({
    logging: { level: "error", format: "json" },
    oauth: {
      providers: {
        github: { clientId: "cid", clientSecret: "csecret", redirectUri: "http://localhost/cb" },
        google: { clientId: "cid", clientSecret: "csecret", redirectUri: "http://localhost/cb" },
      },
    },
  }),
}));

describe("OAuth adapters", () => {
  beforeEach(() => mockFetch.mockReset());

  describe("Google provider", () => {
    it("exchanges code for tokens and profile", async () => {
      const tokens = {
        access_token: "gat",
        refresh_token: "grt",
        id_token: "git",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "openid email",
      };
      const profileRaw = {
        sub: "google-123",
        email: "user@gmail.com",
        name: "Test User",
        picture: "https://pic",
        email_verified: true,
      };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => tokens })
        .mockResolvedValueOnce({ ok: true, json: async () => profileRaw });

      const { exchangeCode } = await import("../../plugins/oauth/providers/google");
      const result = await exchangeCode("code123", "cid", "csecret", "http://localhost/cb");

      expect(result.tokens.access_token).toBe("gat");
      expect(result.profile.id).toBe("google-123");
      expect(result.profile.email).toBe("user@gmail.com");
      expect(result.profile.emailVerified).toBe(true);
    });

    it("throws on token exchange failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => "bad request" });
      const { exchangeCode } = await import("../../plugins/oauth/providers/google");
      await expect(
        exchangeCode("bad-code", "cid", "csecret", "http://localhost/cb")
      ).rejects.toThrow("400");
    });

    it("refreshes access token", async () => {
      const refreshed = {
        access_token: "new-gat",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "openid",
      };
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => refreshed });

      const { refreshToken } = await import("../../plugins/oauth/providers/google");
      const result = await refreshToken("old-refresh", "cid", "csecret");
      expect(result.access_token).toBe("new-gat");
    });
  });

  describe("Facebook provider", () => {
    it("exchanges code and fetches profile", async () => {
      const tokens = { access_token: "fat", token_type: "bearer", expires_in: 3600 };
      const profile = { id: "fb-456", name: "FB User", email: "fb@test.com" };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => tokens })
        .mockResolvedValueOnce({ ok: true, json: async () => profile });

      const { exchangeCode } = await import("../../plugins/oauth/providers/facebook");
      const result = await exchangeCode("code", "cid", "csecret", "http://localhost/cb");

      expect(result.tokens.access_token).toBe("fat");
      expect(result.profile.id).toBe("fb-456");
      expect(result.profile.email).toBe("fb@test.com");
    });

    it("throws on token exchange failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "forbidden" });
      const { exchangeCode } = await import("../../plugins/oauth/providers/facebook");
      await expect(exchangeCode("bad", "cid", "csecret", "http://localhost/cb")).rejects.toThrow(
        "403"
      );
    });
  });

  describe("provider.factory", () => {
    it("returns google adapter", async () => {
      const { getProviderAdapter } = await import("../../plugins/oauth/provider.factory");
      const adapter = getProviderAdapter("google");
      expect(typeof adapter.exchangeCode).toBe("function");
    });

    it("returns github adapter", async () => {
      const { getProviderAdapter } = await import("../../plugins/oauth/provider.factory");
      const adapter = getProviderAdapter("github");
      expect(typeof adapter.exchangeCode).toBe("function");
    });

    it("throws for unconfigured provider", async () => {
      vi.doMock("../../src/config/index.js", () => ({
        getConfig: () => ({ oauth: { providers: {} } }),
      }));
      const { getProviderAdapter } = await import("../../plugins/oauth/provider.factory");
      expect(() => getProviderAdapter("twitter")).toThrow("not configured");
    });
  });
});
