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
export function safeRelativeRedirect(
  input: string | undefined | null,
  fallback = "/"
): string {
  if (!input || typeof input !== "string") return fallback;
  // Block protocol-relative and backslash variants that browsers may treat as
  // absolute URLs ("//evil.com", "/\\evil.com").
  if (input.startsWith("//") || input.startsWith("/\\")) return fallback;
  // Must be a site-relative path.
  if (!input.startsWith("/")) return fallback;
  // Reject anything that parses as an absolute URL with a scheme.
  // e.g. "/javascript:alert(1)" is harmless (path), but "/\\t" tricks are
  // already blocked above; still, guard against control chars.
  if (/[\x00-\x1f\x7f]/.test(input)) return fallback;
  return input;
}
