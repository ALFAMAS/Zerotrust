import { getConfig } from "../config";
import { getLogger } from "../logger";

const logger = getLogger("oauth-factory");

export function getProviderAdapter(provider: string) {
  const cfg = getConfig();
  const p = cfg.oauth.providers[provider];
  if (!p) throw new Error(`OAuth provider not configured: ${provider}`);

  // Very small adapter surface: exchangeCode(code) => { accessToken, idToken, profile }
  if (provider === "google") {
    return {
      async exchangeCode(code: string) {
        // Exchange code for tokens
        const params = new URLSearchParams();
        params.set("code", code);
        params.set("client_id", p.clientId);
        params.set("client_secret", p.clientSecret);
        params.set("redirect_uri", p.redirectUri);
        params.set("grant_type", "authorization_code");

        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
        const tok = await tokenRes.json();

        // Fetch userinfo
        const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${tok.access_token}` },
        });
        const profile = await profileRes.json();

        return { tokens: tok, profile };
      },
    };
  }

  if (provider === "github") {
    return {
      async exchangeCode(code: string) {
        const { exchangeCode: ghExchange } = await import("./providers/github.js");
        return await ghExchange(code, p.clientId, p.clientSecret, p.redirectUri);
      },
    };
  }

  if (provider === "facebook") {
    return {
      async exchangeCode(code: string, _code_verifier?: string) {
        // Facebook token exchange
        const params = new URLSearchParams();
        params.set("client_id", p.clientId);
        params.set("client_secret", p.clientSecret);
        params.set("redirect_uri", p.redirectUri);
        params.set("code", code);

        const tokenRes = await fetch(
          `https://graph.facebook.com/v12.0/oauth/access_token?${params.toString()}`,
          {
            method: "GET",
          }
        );
        const tok = await tokenRes.json();

        if (!tok.access_token) return { tokens: tok, profile: null };
        const profileRes = await fetch("https://graph.facebook.com/me?fields=id,name,email", {
          headers: { Authorization: `Bearer ${tok.access_token}` },
        });
        const profile = await profileRes.json();
        return { tokens: tok, profile };
      },
    };
  }

  if (provider === "apple") {
    return {
      async exchangeCode(code: string, code_verifier?: string) {
        // Apple requires client_secret (JWT) and client_id
        const params = new URLSearchParams();
        params.set("grant_type", "authorization_code");
        params.set("code", code);
        params.set("client_id", p.clientId);
        // client_secret should be provided in provider config (long-lived JWT or generated offline)
        if (p.clientSecret) params.set("client_secret", p.clientSecret);
        if (code_verifier) params.set("code_verifier", code_verifier);

        const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
        const tok = await tokenRes.json();

        // Apple doesn't provide a simple userinfo endpoint. ID token contains user info.
        let profile: any = null;
        if (tok.id_token) {
          try {
            const parts = tok.id_token.split(".");
            const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
            profile = { id: payload.sub, email: payload.email, name: payload.name };
          } catch {
            profile = null;
          }
        }

        return { tokens: tok, profile };
      },
    };
  }

  // No adapter implemented for this (configured) provider. Fail loudly rather
  // than returning a null profile that the caller misreports as a generic
  // "token exchange failed".
  return {
    async exchangeCode(_code: string) {
      logger.error("No OAuth adapter implemented for provider", { provider });
      throw new Error(`UNSUPPORTED_OAUTH_PROVIDER: ${provider}`);
    },
  };
}
