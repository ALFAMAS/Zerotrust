export function safeRelativeRedirect(
  input: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!input || typeof input !== "string") return fallback;
  if (!input.startsWith("/")) return fallback;
  if (input.startsWith("//") || input.startsWith("/\\")) return fallback;
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

function configuredExternalRedirectHosts(): Set<string> {
  const hosts = new Set([
    "accounts.google.com",
    "github.com",
    "www.facebook.com",
    "facebook.com",
    "checkout.stripe.com",
    "billing.stripe.com",
  ]);

  const configured = process.env.NEXT_PUBLIC_ALLOWED_EXTERNAL_REDIRECT_HOSTS;
  if (configured) {
    for (const host of configured.split(",")) {
      const normalized = host.trim().toLowerCase();
      if (normalized) hosts.add(normalized);
    }
  }

  if (typeof window !== "undefined") hosts.add(window.location.hostname.toLowerCase());
  return hosts;
}

export function safeExternalRedirect(input: string | null | undefined): string | null {
  if (!input || typeof input !== "string") return null;
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.protocol === "http:" && parsed.hostname !== "localhost") return null;

    const host = parsed.hostname.toLowerCase();
    const allowed = configuredExternalRedirectHosts();
    if (
      ![...allowed].some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`))
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function navigateToSafeRelative(
  input: string | null | undefined,
  fallback = "/dashboard"
): void {
  window.location.href = safeRelativeRedirect(input, fallback);
}

export function navigateToSafeExternal(
  input: string | null | undefined,
  fallback = "/dashboard"
): void {
  const target = safeExternalRedirect(input) ?? fallback;
  window.location.href = target;
}
