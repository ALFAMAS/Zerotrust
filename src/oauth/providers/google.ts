import { getLogger } from "../../logger";

const logger = getLogger("oauth-google");

export interface GoogleProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<{ tokens: GoogleTokens; profile: GoogleProfile }> {
  const params = new URLSearchParams();
  params.set("code", code);
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("redirect_uri", redirectUri);
  params.set("grant_type", "authorization_code");
  if (codeVerifier) params.set("code_verifier", codeVerifier);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    logger.error("Google token exchange failed", new Error(err));
    throw new Error(`Google token exchange failed: ${tokenRes.status}`);
  }

  const tokens = (await tokenRes.json()) as GoogleTokens;

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!profileRes.ok) {
    throw new Error(`Failed to fetch Google user profile: ${profileRes.status}`);
  }

  const raw = (await profileRes.json()) as any;
  const profile: GoogleProfile = {
    id: raw.sub,
    email: raw.email,
    name: raw.name,
    picture: raw.picture,
    emailVerified: raw.email_verified === true,
  };

  return { tokens, profile };
}

export async function refreshToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<GoogleTokens> {
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status}`);
  }

  return res.json() as Promise<GoogleTokens>;
}
