const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("za_admin_token") ?? "";
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

async function get<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

async function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PUT", path, body);
}

async function patch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PATCH", path, body);
}

async function del<T>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}

export const api = { get, post, put, patch, delete: del };
