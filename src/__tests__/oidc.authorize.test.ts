import { describe, expect, it } from "vitest";
import {
  isRegisteredRedirectUri,
  registerOIDCClient,
  validateAuthorizeRequest,
} from "../oidc/provider";

describe("OIDC authorize — redirect_uri trust", () => {
  registerOIDCClient({
    clientId: "test-client",
    redirectUris: ["https://client.example/callback"],
    scopes: ["openid", "profile", "email"],
    name: "Test Client",
  });

  it("accepts a registered redirect_uri", () => {
    expect(isRegisteredRedirectUri("test-client", "https://client.example/callback")).toBe(true);
    const result = validateAuthorizeRequest({
      clientId: "test-client",
      redirectUri: "https://client.example/callback",
      responseType: "code",
      scope: "openid",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects an unregistered (attacker-chosen) redirect_uri", () => {
    // The fix relies on this: the route must NOT redirect to a redirect_uri that
    // is not registered, because doing so is an open redirect (OAuth BCP §4.1.1).
    expect(isRegisteredRedirectUri("test-client", "https://evil.example/steal")).toBe(false);
    const result = validateAuthorizeRequest({
      clientId: "test-client",
      redirectUri: "https://evil.example/steal",
      responseType: "code",
      scope: "openid",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("invalid_request");
  });

  it("treats an unknown client as untrusted", () => {
    expect(isRegisteredRedirectUri("no-such-client", "https://client.example/callback")).toBe(
      false
    );
  });
});
