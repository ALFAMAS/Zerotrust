export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
) {
  const params = new URLSearchParams();
  params.set("code", code);
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("redirect_uri", redirectUri);

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params.toString(),
  });
  const tok = await tokenRes.json();

  if (!tok.access_token) return { tokens: tok, profile: null };

  const profileRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" },
  });
  const profile = await profileRes.json();

  return { tokens: tok, profile };
}
