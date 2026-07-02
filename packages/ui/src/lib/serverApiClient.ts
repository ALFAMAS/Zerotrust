/**
 * Server-side HTTP boundary for Next.js RSC / route handlers (P3.4).
 *
 * Reads the mirrored access-token cookie set by `setToken()` in `auth.ts`
 * so Server Components can prefetch authenticated reads without localStorage.
 * Client mutations continue to use `apiClient.ts`.
 */

import { cookies } from "next/headers";

const BASE_URL = process.env.NEXT_PUBLIC_ZEROTRUST_URL || "http://localhost:1337";

export class ServerApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ServerApiError";
    this.status = status;
    this.code = code;
  }
}

export interface ServerApiGetOptions {
  /** Skip attaching Bearer token (public endpoints). */
  skipAuth?: boolean;
}

export async function serverApiGet<T>(path: string, options: ServerApiGetOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };

  if (!options.skipAuth) {
    const cookieStore = await cookies();
    const token = cookieStore.get("za_access_token")?.value;
    if (token) headers.Authorization = `Bearer ${decodeURIComponent(token)}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    let message = res.statusText || "Request failed";
    let code: string | undefined;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
      code = body.error;
    } catch {
      // non-JSON error body — keep statusText
    }
    throw new ServerApiError(message, res.status, code);
  }

  return res.json() as Promise<T>;
}
