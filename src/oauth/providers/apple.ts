import { getLogger } from "../../logger";

const logger = getLogger("oauth-apple");

export interface AppleProfile {
  id: string;
  email?: string;
  name?: string;
  emailVerified?: boolean;
}

export interface AppleTokens {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  expires_in: number;
  token_type: string;
}

interface AppleIDTokenPayload {
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  email?: string;
  email_verified?: string | boolean;
  is_private_email?: string | boolean;
  real_user_status?: number;
}

function decodeIdToken(idToken: string): AppleIDTokenPayload {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid Apple ID token format");
  const payload = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(payload) as AppleIDTokenPayload;
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  codeVerifier?: string,
  userPayload?: { name?: { firstName?: string; lastName?: string }; email?: string }
): Promise<{ tokens: AppleTokens; profile: AppleProfile }> {
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("redirect_uri", redirectUri);
  if (codeVerifier) params.set("code_verifier", codeVerifier);

  const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    logger.error("Apple token exchange failed", new Error(err));
    throw new Error(`Apple token exchange failed: ${tokenRes.status}`);
  }

  const tokens = (await tokenRes.json()) as AppleTokens;

  const idPayload = decodeIdToken(tokens.id_token);

  const name = userPayload?.name
    ? [userPayload.name.firstName, userPayload.name.lastName].filter(Boolean).join(" ")
    : undefined;

  const profile: AppleProfile = {
    id: idPayload.sub,
    email: idPayload.email || userPayload?.email,
    name,
    emailVerified: idPayload.email_verified === true || idPayload.email_verified === "true",
  };

  return { tokens, profile };
}

export async function refreshAppleToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<AppleTokens> {
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);

  const res = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) throw new Error(`Apple token refresh failed: ${res.status}`);
  return res.json() as Promise<AppleTokens>;
}
