import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => cookiesMock(),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  cookiesMock.mockReset();
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

import { ServerApiError, serverApiGet } from "./serverApiClient";

function jsonResponse(status: number, body: unknown): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => body,
  } as unknown as Response;
}

describe("serverApiClient", () => {
  it("attaches the mirrored access-token cookie as Bearer auth", async () => {
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        name === "za_access_token" ? { value: encodeURIComponent("cookie-tok") } : undefined,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: "u1" }));

    await serverApiGet("/auth/me");

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer cookie-tok");
    expect((init.headers as Record<string, string>).Accept).toBe("application/json");
  });

  it("skips auth when skipAuth is true", async () => {
    cookiesMock.mockResolvedValue({
      get: () => ({ value: "ignored" }),
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await serverApiGet("/status", { skipAuth: true });

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("maps JSON error bodies to ServerApiError", async () => {
    cookiesMock.mockResolvedValue({ get: () => undefined });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "FORBIDDEN", message: "Admin only" })
    );

    await expect(serverApiGet("/admin/stats")).rejects.toMatchObject({
      name: "ServerApiError",
      status: 403,
      code: "FORBIDDEN",
      message: "Admin only",
    } satisfies Partial<ServerApiError>);
  });

  it("uses statusText when the error body is not JSON", async () => {
    cookiesMock.mockResolvedValue({ get: () => undefined });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(serverApiGet("/auth/me")).rejects.toMatchObject({
      status: 502,
      message: "Bad Gateway",
    });
  });
});
