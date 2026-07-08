const LOCALHOST_API_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

/** Strip trailing slash; empty string when unset. */
export function normalizeApiUrl(url: string | undefined): string {
  return (url ?? "").trim().replace(/\/$/, "");
}

/** True when the URL targets loopback (misconfiguration for internet-facing UI builds). */
export function isLocalhostApiUrl(url: string): boolean {
  return LOCALHOST_API_PATTERN.test(normalizeApiUrl(url));
}

/**
 * Fail-fast guard for production UI builds (`ZEROTRUST_ENFORCE_PUBLIC_API_URL=true`).
 * CI and local dev omit the flag and keep the localhost default.
 */
export function enforceProductionApiUrl(url: string | undefined): void {
  const normalized = normalizeApiUrl(url);
  if (!normalized) {
    throw new Error(
      "NEXT_PUBLIC_ZEROTRUST_URL must be set when ZEROTRUST_ENFORCE_PUBLIC_API_URL=true"
    );
  }
  if (isLocalhostApiUrl(normalized)) {
    throw new Error(
      `NEXT_PUBLIC_ZEROTRUST_URL must not point at localhost for production deploy builds (got ${normalized})`
    );
  }
}
