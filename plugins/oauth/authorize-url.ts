// Static, per-provider OAuth 2.0 metadata used to build the authorization-code
// redirect. Kept separate from `provider.factory.ts` (which is mocked wholesale
// in route tests) so the URL builder can be unit-tested directly.

export interface ProviderMeta {
  label: string;
  authorizationUrl: string;
  scopes: string[];
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
  apple: {
    label: "Apple",
    authorizationUrl: "https://appleid.apple.com/auth/authorize",
    scopes: ["name", "email"],
    supportsPKCE: true,
  },
};

export function isSupportedProvider(provider: string): provider is keyof typeof PROVIDER_META {
  return provider in PROVIDER_META;
}

export interface AuthorizationUrlOptions {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge?: string;
}

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

  if (provider === "apple") {
    url.searchParams.set("response_mode", "query");
  }

  return url.toString();
}
