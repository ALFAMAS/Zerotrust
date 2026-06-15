import { getToken, getRefreshToken, setToken, clearToken } from "./auth";

const BASE_URL = process.env.NEXT_PUBLIC_ZEROAUTH_URL || "http://localhost:3000";

/**
 * When an access token expires we get a single 401. We try to silently mint a
 * fresh access token from the stored refresh token and replay the request once.
 * Concurrent 401s share one in-flight refresh so we never stampede the endpoint.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const res = await fetch(`${BASE_URL}/auth/token/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null);

  if (!res || !res.ok) return false;
  const data = await res.json().catch(() => null);
  if (!data?.accessToken) return false;
  setToken(data.accessToken, data.refreshToken);
  return true;
}

function redirectToLogin(): void {
  clearToken();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  skipAuth = false,
  isRetry = false
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token && !skipAuth) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Access token likely expired — attempt one silent refresh + replay.
  if (res.status === 401 && !skipAuth && !isRetry && getRefreshToken()) {
    refreshInFlight = refreshInFlight ?? refreshAccessToken();
    const refreshed = await refreshInFlight;
    refreshInFlight = null;
    if (refreshed) {
      return request<T>(method, path, body, skipAuth, true);
    }
    // Refresh failed: the session is gone. Bounce to login.
    redirectToLogin();
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw Object.assign(new Error(err.message || `HTTP ${res.status}`), {
      code: err.code,
      status: res.status,
    });
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown, skipAuth = false) =>
    request<T>("POST", path, body, skipAuth),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
