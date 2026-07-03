import { getConfig } from "../config";
import { getLogger } from "../logger";

const logger = getLogger("oauth-factory");

/** Provider-agnostic user profile the auth callback consumes. */
export interface NormalizedProfile {
  /** Stable provider-side user id (always a string). */
  id: string;
  email?: string;
  name?: string;
  /** True when the provider asserts the email address is verified. */
  emailVerified?: boolean;
}

export interface ExchangeResult {
  tokens: unknown;
  profile: NormalizedProfile | null;
}

export interface ProviderAdapter {
  exchangeCode(code: string, codeVerifier?: string): Promise<ExchangeResult>;
}

/**
 * Resolve the token-exchange adapter for a configured provider. Each adapter
 * delegates to the dedicated module under `./providers/*`, which owns the HTTP
 * calls, error handling, and profile normalization. Providers that are listed in
 * config but have no implementation fail loudly via UNSUPPORTED_OAUTH_PROVIDER.
 */
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
      // Configured but unimplemented. Fail loudly rather than returning a null
      // profile the caller misreports as a generic failure.
      return {
        async exchangeCode() {
          logger.error("No OAuth adapter implemented for provider", { provider });
          throw new Error(`UNSUPPORTED_OAUTH_PROVIDER: ${provider}`);
        },
      };
  }
}
