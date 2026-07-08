import { getLogger } from "../../../src/logger/index.js";
import { fetchFixedUrl } from "../../../src/shared/safeFetch.js";

const logger = getLogger("oauth-apple");

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_ISSUER = "https://appleid.apple.com";

export interface AppleProfile {
  id: string;
  email?: string;
  name?: string;
  emailVerified: boolean;
}

export interface AppleTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token: string;
}

export interface AppleUserInfo {
  name?: { firstName?: string; lastName?: string };
  email?: string;
}

interface AppleIdTokenClaims {
  iss: string;
  aud: string;
  exp: number;
  sub: string;
  email?: string;
  email_verified?: boolean | string;
}

function decodeJwtPayload<T>(jwt: string): T {
  const segments = jwt.split(".");
  if (segments.length !== 3) {
    throw new Error("Invalid Apple id_token format");
  }
  const payload = Buffer.from(segments[1], "base64url").toString("utf8");
  return JSON.parse(payload) as T;
}

function isEmailVerified(value: boolean | string | undefined): boolean {
  return value === true || value === "true";
}

function parseIdToken(idToken: string, clientId: string): AppleProfile {
  const claims = decodeJwtPayload<AppleIdTokenClaims>(idToken);
  if (claims.iss !== APPLE_ISSUER) {
    throw new Error("Invalid Apple id_token issuer");
  }
  if (claims.aud !== clientId) {
    throw new Error("Invalid Apple id_token audience");
  }
  if (claims.exp * 1000 < Date.now()) {
    throw new Error("Expired Apple id_token");
  }
  return {
    id: claims.sub,
    email: claims.email,
    emailVerified: isEmailVerified(claims.email_verified),
  };
}

export function mergeAppleUserName(
  profile: AppleProfile,
  userInfo?: AppleUserInfo | null
): AppleProfile {
  if (!userInfo?.name) return profile;
  const { firstName, lastName } = userInfo.name;
  const parts = [firstName, lastName].filter(Boolean);
  if (parts.length === 0) return profile;
  return { ...profile, name: parts.join(" ") };
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  codeVerifier?: string,
  userInfo?: AppleUserInfo | null
): Promise<{ tokens: AppleTokens; profile: AppleProfile }> {
  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("code", code);
  params.set("grant_type", "authorization_code");
  params.set("redirect_uri", redirectUri);
  if (codeVerifier) params.set("code_verifier", codeVerifier);

  const tokenRes = await fetchFixedUrl(APPLE_TOKEN_URL, {
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
  if (!tokens.id_token) {
    throw new Error("Apple token response missing id_token");
  }

  let profile = parseIdToken(tokens.id_token, clientId);
  profile = mergeAppleUserName(profile, userInfo);
  return { tokens, profile };
}
