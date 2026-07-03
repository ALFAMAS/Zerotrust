// Static, per-provider OAuth 2.0 metadata used to build the authorization-code
// redirect. Kept separate from `provider.factory.ts` (which is mocked wholesale
// in route tests) so the URL builder can be unit-tested directly and imported by
// the auth routes without pulling in the token-exchange adapters.

export interface ProviderMeta {
  /** Human label for logs/UI. */
  label: string;
  /** Provider authorization endpoint (the consent screen). */
  authorizationUrl: string;
  /** OAuth scopes requested at sign-in. */
  scopes: string[];
  /**
   * Whether the provider supports PKCE (RFC 7636, S256). GitHub OAuth Apps do
   * not, so we only attach a code_challenge for providers that honor it.
   */
  supportsPKCE: boolean;
}

export const PROVIDER_META: Record<string, ProviderMeta> = {
  google: {
    label: "Google",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: ["openid", "email", "profile"],
    supportsPKCE: true,
  },
  github: {
    label: "GitHub",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    scopes: ["read:user", "user:email"],
    supportsPKCE: false,
  },
  facebook: {
    label: "Facebook",
    authorizationUrl: "https://www.facebook.com/v18.0/dialog/oauth",
    scopes: ["email", "public_profile"],
    supportsPKCE: true,
  },
};

/** Providers we can actually start an authorization flow for. */
export function isSupportedProvider(provider: string): provider is keyof typeof PROVIDER_META {
  // `in` (rather than Object.hasOwn) keeps this compatible with the project's
  // pre-es2022 lib target while still satisfying Biome's lint rules.
  return provider in PROVIDER_META;
}

export interface AuthorizationUrlOptions {
  clientId: string;
  redirectUri: string;
  /** Opaque CSRF token echoed back on the callback. */
  state: string;
  /** PKCE S256 challenge — included only when the provider supports PKCE. */
  codeChallenge?: string;
}

/**
 * Build the provider's authorization-code URL. Throws for unsupported providers
 * so callers fail loudly rather than redirecting users to an empty/invalid URL.
 */
export function buildAuthorizationUrl(provider: string, opts: AuthorizationUrlOptions): string {
  const meta = PROVIDER_META[provider];
  if (!meta) throw new Error(`UNSUPPORTED_OAUTH_PROVIDER: ${provider}`);

  const url = new URL(meta.authorizationUrl);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", meta.scopes.join(" "));
  url.searchParams.set("state", opts.state);

  if (meta.supportsPKCE && opts.codeChallenge) {
    url.searchParams.set("code_challenge", opts.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }

  return url.toString();
}
