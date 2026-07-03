/**
 * ADR 008 Option C — in-memory access token + httpOnly refresh cookie.
 * Refresh tokens never touch localStorage or JS-readable storage.
 */

const ACCESS_TOKEN_COOKIE = "za_access_token";

/** Legacy keys — cleared on logout for users upgrading from Option A. */
const LEGACY_ACCESS_KEY = "za_access_token";
const LEGACY_REFRESH_KEY = "za_refresh_token";

let accessTokenMemory: string | null = null;

function setAccessTokenCookie(accessToken: string): void {
  // biome-ignore lint/suspicious/noDocumentCookie: first-party auth cookie for RSC prefetch
  document.cookie = `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(accessToken)};path=/;max-age=3600;samesite=lax`;
}

function clearAccessTokenCookie(): void {
  // biome-ignore lint/suspicious/noDocumentCookie: clear mirrored auth cookie on logout
  document.cookie = `${ACCESS_TOKEN_COOKIE}=;path=/;max-age=0;samesite=lax`;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return accessTokenMemory;
}

/** Refresh token is httpOnly — not readable from JS (returns null by design). */
export function getRefreshToken(): string | null {
  return null;
}

export function setToken(accessToken: string, _refreshToken?: string): void {
  if (typeof window === "undefined") return;
  accessTokenMemory = accessToken;
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  setAccessTokenCookie(accessToken);
}

export async function clearToken(): Promise<void> {
  if (typeof window === "undefined") return;
  accessTokenMemory = null;
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  clearAccessTokenCookie();
  const base = process.env.NEXT_PUBLIC_ZEROTRUST_URL || "http://localhost:1337";
  try {
    await fetch(`${base}/auth/logout`, { method: "POST", credentials: "include" });
  } catch {
    // best-effort — cookie may already be gone
  }
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/** Attempt silent refresh via httpOnly cookie (page reload bootstrap). */
export async function bootstrapAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (accessTokenMemory) return accessTokenMemory;
  const base = process.env.NEXT_PUBLIC_ZEROTRUST_URL || "http://localhost:1337";
  try {
    const res = await fetch(`${base}/auth/token/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken?: string };
    if (data.accessToken) {
      setToken(data.accessToken);
      return data.accessToken;
    }
  } catch {
    return null;
  }
  return null;
}
