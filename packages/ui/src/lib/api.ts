import { getToken, setToken, clearToken } from "./auth";

const BASE_URL = process.env.NEXT_PUBLIC_ZEROAUTH_URL || "http://localhost:3000";

async function request<T>(method: string, path: string, body?: unknown, skipAuth = false): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token && !skipAuth) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw Object.assign(new Error(err.message || `HTTP ${res.status}`), { code: err.code, status: res.status });
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown, skipAuth = false) => request<T>("POST", path, body, skipAuth),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
