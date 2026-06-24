import { getLogger } from "../../logger";

const logger = getLogger("oauth-github");

export interface GitHubProfile {
  id: string;
  email?: string;
  name?: string;
  emailVerified: boolean;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

// GitHub OAuth Apps do not support PKCE, so `codeVerifier` is accepted for a
// uniform adapter signature but never sent.
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  _codeVerifier?: string
): Promise<{ tokens: unknown; profile: GitHubProfile | null }> {
  const params = new URLSearchParams();
  params.set("code", code);
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("redirect_uri", redirectUri);

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    logger.error("GitHub token exchange failed", new Error(err));
    throw new Error(`GitHub token exchange failed: ${tokenRes.status}`);
  }

  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) return { tokens, profile: null };

  // GitHub requires a User-Agent on every API request.
  const authHeaders = {
    Authorization: `Bearer ${tokens.access_token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "zerotrust",
  };

  const profileRes = await fetch("https://api.github.com/user", {
    headers: authHeaders,
  });
  if (!profileRes.ok) {
    throw new Error(`Failed to fetch GitHub user profile: ${profileRes.status}`);
  }
  const raw = (await profileRes.json()) as {
    id: number;
    login: string;
    name?: string;
    email?: string;
  };

  let email = raw.email ?? undefined;
  let emailVerified = false;
  if (email) {
    // A public primary email on the profile is, by definition, verified.
    emailVerified = true;
  } else {
    // Email is private — resolve the verified primary via the emails endpoint
    // (needs the `user:email` scope, which we request at authorization time).
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: authHeaders,
    });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as GitHubEmail[];
      const chosen = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
      if (chosen) {
        email = chosen.email;
        emailVerified = chosen.verified;
      }
    }
  }

  return {
    tokens,
    profile: {
      id: String(raw.id),
      email,
      name: raw.name || raw.login,
      emailVerified,
    },
  };
}
