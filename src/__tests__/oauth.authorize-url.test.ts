import { describe, expect, it } from "vitest";
import {
  buildAuthorizationUrl,
  isSupportedProvider,
  PROVIDER_META,
} from "../../plugins/oauth/authorize-url";

describe("isSupportedProvider", () => {
  it("accepts implemented providers and rejects others", () => {
    expect(isSupportedProvider("google")).toBe(true);
    expect(isSupportedProvider("github")).toBe(true);
    expect(isSupportedProvider("facebook")).toBe(true);
    expect(isSupportedProvider("apple")).toBe(true);
    expect(isSupportedProvider("twitter")).toBe(false);
  });
});

describe("buildAuthorizationUrl", () => {
  const base = {
    clientId: "cid",
    redirectUri: "http://localhost:1337/auth/oauth/google/callback",
    state: "state-123",
  };

  it("includes the PKCE challenge for PKCE-capable providers", () => {
    const url = new URL(
      buildAuthorizationUrl("google", { ...base, codeChallenge: "chal" })
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe(base.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toBe(PROVIDER_META.google.scopes.join(" "));
    expect(url.searchParams.get("code_challenge")).toBe("chal");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("omits PKCE params for providers that don't support it (GitHub)", () => {
    const url = new URL(buildAuthorizationUrl("github", { ...base, codeChallenge: "chal" }));
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("code_challenge")).toBeNull();
    expect(url.searchParams.get("code_challenge_method")).toBeNull();
  });

  it("throws for an unsupported provider", () => {
    expect(() => buildAuthorizationUrl("twitter", base)).toThrow(/UNSUPPORTED_OAUTH_PROVIDER/);
  });

  it("sets response_mode=query for Apple", () => {
    const url = new URL(
      buildAuthorizationUrl("apple", { ...base, codeChallenge: "chal" })
    );
    expect(url.origin + url.pathname).toBe("https://appleid.apple.com/auth/authorize");
    expect(url.searchParams.get("response_mode")).toBe("query");
    expect(url.searchParams.get("scope")).toBe(PROVIDER_META.apple.scopes.join(" "));
    expect(url.searchParams.get("code_challenge")).toBe("chal");
  });
});
