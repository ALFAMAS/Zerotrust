const ACCESS_TOKEN_KEY = "za_access_token";
const REFRESH_TOKEN_KEY = "za_refresh_token";
/** Cookie mirror for RSC server prefetch (see docs/ui-http-client.md). */
const ACCESS_TOKEN_COOKIE = "za_access_token";

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
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setToken(accessToken: string, refreshToken?: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  setAccessTokenCookie(accessToken);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  clearAccessTokenCookie();
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}
