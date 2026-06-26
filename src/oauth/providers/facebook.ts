import { getLogger } from "../../logger";
import { fetchFixedUrl } from "../../shared/safeFetch";

const logger = getLogger("oauth-facebook");

export interface FacebookProfile {
  id: string;
  email?: string;
  name: string;
  picture?: { data: { url: string } };
}

export interface FacebookTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

const GRAPH_API_VERSION = "v18.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<{ tokens: FacebookTokens; profile: FacebookProfile }> {
  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("redirect_uri", redirectUri);
  params.set("code", code);
  if (codeVerifier) params.set("code_verifier", codeVerifier);

  const tokenRes = await fetchFixedUrl(`${GRAPH_BASE}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    logger.error("Facebook token exchange failed", new Error(err));
    throw new Error(`Facebook token exchange failed: ${tokenRes.status}`);
  }

  const tokens = (await tokenRes.json()) as FacebookTokens;

  const fields = "id,name,email,picture.type(large)";
  const profileRes = await fetchFixedUrl(`${GRAPH_BASE}/me?fields=${encodeURIComponent(fields)}`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!profileRes.ok) {
    throw new Error(`Failed to fetch Facebook user profile: ${profileRes.status}`);
  }

  const profile = (await profileRes.json()) as FacebookProfile;
  return { tokens, profile };
}

export async function refreshToken(
  shortLivedToken: string,
  clientId: string,
  clientSecret: string
): Promise<FacebookTokens> {
  const params = new URLSearchParams();
  params.set("grant_type", "fb_exchange_token");
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("fb_exchange_token", shortLivedToken);

  const res = await fetchFixedUrl(`${GRAPH_BASE}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Facebook token refresh failed: ${res.status}`);
  return res.json() as Promise<FacebookTokens>;
}
