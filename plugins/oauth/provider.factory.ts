import { getConfig } from "../../src/config/index.js";
import { getLogger } from "../../src/logger/index.js";

const logger = getLogger("oauth-factory");

export interface NormalizedProfile {
  id: string;
  email?: string;
  name?: string;
  emailVerified?: boolean;
}

export interface ExchangeResult {
  tokens: unknown;
  profile: NormalizedProfile | null;
}

export interface ProviderAdapter {
  exchangeCode(code: string, codeVerifier?: string): Promise<ExchangeResult>;
}

export function getProviderAdapter(provider: string): ProviderAdapter {
  const cfg = getConfig();
  const p = cfg.oauth.providers[provider];
  if (!p) throw new Error(`OAuth provider not configured: ${provider}`);

  switch (provider) {
    case "google":
      return {
        async exchangeCode(code, codeVerifier) {
          const { exchangeCode } = await import("./providers/google.js");
          const { tokens, profile } = await exchangeCode(
            code,
            p.clientId,
            p.clientSecret,
            p.redirectUri,
            codeVerifier
          );
          return { tokens, profile };
        },
      };

    case "github":
      return {
        async exchangeCode(code, codeVerifier) {
          const { exchangeCode } = await import("./providers/github.js");
          return exchangeCode(code, p.clientId, p.clientSecret, p.redirectUri, codeVerifier);
        },
      };

    case "facebook":
      return {
        async exchangeCode(code, codeVerifier) {
          const { exchangeCode } = await import("./providers/facebook.js");
          const { tokens, profile } = await exchangeCode(
            code,
            p.clientId,
            p.clientSecret,
            p.redirectUri,
            codeVerifier
          );
          return { tokens, profile };
        },
      };

    default:
      return {
        async exchangeCode() {
          logger.error("No OAuth adapter implemented for provider", { provider });
          throw new Error(`UNSUPPORTED_OAUTH_PROVIDER: ${provider}`);
        },
      };
  }
}
