/**
 * Safe redirect helper — prevents open-redirect (CWE-601) and token leakage
 * via attacker-controlled redirect targets.
 *
 * Accepts only same-origin *relative* paths: must start with a single "/",
 * must not start with "//" (protocol-relative) or "/\" (backslash trickery),
 * and must not contain a scheme. Anything else falls back to `fallback`.
 *
 * Use this for ANY redirect whose target comes (directly or via relay state /
 * cookie) from a request parameter — magic-link, SAML RelayState, OAuth
 * `redirect_uri` post-login deep links, etc. For OAuth/OIDC client redirects
 * prefer an explicit registered-URI allowlist (`isRegisteredRedirectUri`).
 */
export function safeRelativeRedirect(input: string | undefined | null, fallback = "/"): string {
  if (!input || typeof input !== "string") return fallback;
  // Block protocol-relative and backslash variants that browsers may treat as
  // absolute URLs ("//evil.com", "/\\evil.com").
  if (input.startsWith("//") || input.startsWith("/\\")) return fallback;
  // Must be a site-relative path.
  if (!input.startsWith("/")) return fallback;
  // Reject anything that parses as an absolute URL with a scheme.
  // e.g. "/javascript:alert(1)" is harmless (path), but "/\\t" tricks are
  // already blocked above; still, guard against control chars.
  if (hasControlCharacter(input)) return fallback;
  return input;
}

function hasControlCharacter(input: string): boolean {
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function safeHttpOrigin(input: string | undefined | null, fallback: string): string {
  try {
    const parsed = new URL(input || fallback);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fallback;
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

/**
 * Build an app-local redirect URL from an operator-controlled app origin and a
 * user-influenced relative path. The path is always passed through
 * `safeRelativeRedirect()` before it is appended to the app origin.
 */
export function appRedirectUrl(
  path: string | undefined | null,
  appUrl = process.env.APP_URL,
  fallbackPath = "/"
): string {
  const origin = safeHttpOrigin(appUrl, "http://localhost:3000");
  const safePath = safeRelativeRedirect(path, fallbackPath);
  return new URL(safePath, origin).toString();
}
