import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../config", () => ({
  getConfig: () => ({
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

      const { exchangeCode } = await import("../oauth/providers/google");
      const result = await exchangeCode("code123", "cid", "csecret", "http://localhost/cb");

      expect(result.tokens.access_token).toBe("gat");
      expect(result.profile.id).toBe("google-123");
      expect(result.profile.email).toBe("user@gmail.com");
      expect(result.profile.emailVerified).toBe(true);
    });

    it("throws on token exchange failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => "bad request" });
      const { exchangeCode } = await import("../oauth/providers/google");
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

      const { refreshToken } = await import("../oauth/providers/google");
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

      const { exchangeCode } = await import("../oauth/providers/facebook");
      const result = await exchangeCode("code", "cid", "csecret", "http://localhost/cb");

      expect(result.tokens.access_token).toBe("fat");
      expect(result.profile.id).toBe("fb-456");
      expect(result.profile.email).toBe("fb@test.com");
    });

    it("throws on token exchange failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "forbidden" });
      const { exchangeCode } = await import("../oauth/providers/facebook");
      await expect(exchangeCode("bad", "cid", "csecret", "http://localhost/cb")).rejects.toThrow(
        "403"
      );
    });
  });

  describe("Apple provider", () => {
    it("decodes ID token and extracts profile", async () => {
      const idTokenPayload = {
        iss: "https://appleid.apple.com",
        sub: "apple-789",
        aud: "cid",
        iat: 0,
        exp: 99999999,
        email: "apple@test.com",
        email_verified: "true",
      };
      const encodedPayload = Buffer.from(JSON.stringify(idTokenPayload)).toString("base64url");
      const idToken = `header.${encodedPayload}.signature`;
      const tokens = {
        access_token: "aat",
        id_token: idToken,
        expires_in: 3600,
        token_type: "Bearer",
      };

      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => tokens });

      const { exchangeCode } = await import("../oauth/providers/apple");
      const result = await exchangeCode("code", "cid", "csecret", "http://localhost/cb");

      expect(result.profile.id).toBe("apple-789");
      expect(result.profile.email).toBe("apple@test.com");
      expect(result.profile.emailVerified).toBe(true);
    });

    it("handles user payload with name on first request", async () => {
      const idTokenPayload = {
        sub: "apple-999",
        aud: "cid",
        iat: 0,
        exp: 99999999,
        email: "x@apple.com",
        email_verified: true,
      };
      const encodedPayload = Buffer.from(JSON.stringify(idTokenPayload)).toString("base64url");
      const idToken = `header.${encodedPayload}.sig`;
      const tokens = {
        access_token: "aat2",
        id_token: idToken,
        expires_in: 3600,
        token_type: "Bearer",
      };

      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => tokens });

      const { exchangeCode } = await import("../oauth/providers/apple");
      const result = await exchangeCode(
        "code",
        "cid",
        "csecret",
        "http://localhost/cb",
        undefined,
        {
          name: { firstName: "Jane", lastName: "Doe" },
        }
      );

      expect(result.profile.name).toBe("Jane Doe");
    });

    it("throws on token exchange failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "invalid_grant",
      });
      const { exchangeCode } = await import("../oauth/providers/apple");
      await expect(exchangeCode("bad", "cid", "csecret", "http://localhost/cb")).rejects.toThrow(
        "400"
      );
    });
  });

  describe("provider.factory", () => {
    it("returns google adapter", async () => {
      const { getProviderAdapter } = await import("../oauth/provider.factory");
      const adapter = getProviderAdapter("google");
      expect(typeof adapter.exchangeCode).toBe("function");
    });

    it("returns github adapter", async () => {
      const { getProviderAdapter } = await import("../oauth/provider.factory");
      const adapter = getProviderAdapter("github");
      expect(typeof adapter.exchangeCode).toBe("function");
    });

    it("throws for unconfigured provider", async () => {
      vi.doMock("../config", () => ({
        getConfig: () => ({ oauth: { providers: {} } }),
      }));
      const { getProviderAdapter } = await import("../oauth/provider.factory");
      expect(() => getProviderAdapter("twitter")).toThrow("not configured");
    });
  });
});
