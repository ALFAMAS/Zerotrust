import { beforeEach, describe, expect, it, vi } from "vitest";

// Mutable token state the mocked auth module reads from.
const tokens = { access: null as string | null, refresh: null as string | null };

vi.mock("./auth", () => ({
  getToken: () => tokens.access,
  getRefreshToken: () => tokens.refresh,
  setToken: (a: string, r?: string) => {
    tokens.access = a;
    if (r) tokens.refresh = r;
  },
  clearToken: vi.fn(() => {
    tokens.access = null;
    tokens.refresh = null;
  }),
}));

vi.mock("./offlineQueue", () => ({
  isQueueableMethod: () => false,
  enqueueWrite: vi.fn(),
}));

import { clearToken } from "./auth";
import { api } from "./api";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  tokens.access = null;
  tokens.refresh = null;
  fetchMock.mockReset();
  (clearToken as unknown as ReturnType<typeof vi.fn>).mockClear();
  (globalThis as any).fetch = fetchMock;
  // Bust the api module's in-memory GET cache between tests.
  api.invalidateCache("");
});

describe("api client — auth header", () => {
  it("attaches a Bearer access token when present", async () => {
    tokens.access = "tok-123";
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await api.get("/auth/me");
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("omits the Authorization header when skipAuth is set", async () => {
    tokens.access = "tok-123";
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await api.post("/auth/login", { email: "a@b.c" }, true);
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("api client — 401 refresh & replay", () => {
  it("on 401 mints a new token and replays the request once", async () => {
    tokens.access = "stale";
    tokens.refresh = "refresh-1";
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: "TOKEN_EXPIRED" })) // original
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "fresh", refreshToken: "refresh-2" })) // /auth/token/refresh
      .mockResolvedValueOnce(jsonResponse(200, { me: true })); // replay

    const data = await api.get<{ me: boolean }>("/auth/me");
    expect(data.me).toBe(true);
    // The replay must carry the freshly minted token.
    const replay = fetchMock.mock.calls[2];
    expect((replay[1].headers as Record<string, string>).Authorization).toBe("Bearer fresh");
  });

  it("clears the session when the refresh fails", async () => {
    tokens.access = "stale";
    tokens.refresh = "refresh-1";
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: "TOKEN_EXPIRED" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "INVALID_REFRESH" })); // refresh rejected

    await expect(api.get("/auth/me")).rejects.toBeTruthy();
    expect(clearToken).toHaveBeenCalled();
  });
});

describe("api client — resilience & errors", () => {
  it("retries on 5xx and then resolves", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, { error: "DOWN" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const data = await api.get<{ ok: boolean }>("/status");
    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a structured error (message + code + status) on a 4xx", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { message: "Bad input", code: "INVALID_REQUEST" })
    );
    await expect(api.post("/orgs", {})).rejects.toMatchObject({
      message: "Bad input",
      code: "INVALID_REQUEST",
      status: 400,
    });
  });
});
