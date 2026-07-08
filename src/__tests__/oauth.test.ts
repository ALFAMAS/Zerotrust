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
        apple: { clientId: "cid", clientSecret: "jwt-secret", redirectUri: "http://localhost/cb" },
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

  describe("Apple provider", () => {
    function makeAppleIdToken(claims: Record<string, unknown>): string {
      const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test" })).toString(
        "base64url"
      );
      const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
      return `${header}.${payload}.signature`;
    }

    it("exchanges code and parses id_token profile", async () => {
      const idToken = makeAppleIdToken({
        iss: "https://appleid.apple.com",
        aud: "cid",
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: "apple-001",
        email: "user@privaterelay.appleid.com",
        email_verified: "true",
      });
      const tokens = {
        access_token: "aat",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: idToken,
      };

      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => tokens });

      const { exchangeCode } = await import("../../plugins/oauth/providers/apple");
      const result = await exchangeCode("code123", "cid", "jwt-secret", "http://localhost/cb");

      expect(result.tokens.access_token).toBe("aat");
      expect(result.profile.id).toBe("apple-001");
      expect(result.profile.email).toBe("user@privaterelay.appleid.com");
      expect(result.profile.emailVerified).toBe(true);
    });

    it("merges first-sign-in name from user payload", async () => {
      const idToken = makeAppleIdToken({
        iss: "https://appleid.apple.com",
        aud: "cid",
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: "apple-002",
        email: "user@privaterelay.appleid.com",
        email_verified: true,
      });
      const tokens = {
        access_token: "aat",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: idToken,
      };

      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => tokens });

      const { exchangeCode } = await import("../../plugins/oauth/providers/apple");
      const result = await exchangeCode(
        "code123",
        "cid",
        "jwt-secret",
        "http://localhost/cb",
        "verifier",
        { name: { firstName: "Jane", lastName: "Apple" } }
      );

      expect(result.profile.name).toBe("Jane Apple");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://appleid.apple.com/auth/token");
      expect(init?.method).toBe("POST");
      expect(init?.body).toContain("code_verifier=verifier");
    });

    it("throws on token exchange failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => "bad request" });
      const { exchangeCode } = await import("../../plugins/oauth/providers/apple");
      await expect(
        exchangeCode("bad-code", "cid", "jwt-secret", "http://localhost/cb")
      ).rejects.toThrow("400");
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

    it("returns apple adapter", async () => {
      const { getProviderAdapter } = await import("../../plugins/oauth/provider.factory");
      const adapter = getProviderAdapter("apple");
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
