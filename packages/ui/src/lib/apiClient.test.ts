import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tokens = { access: null as string | null };

vi.mock("./auth", () => ({
  getToken: () => tokens.access,
  clearToken: vi.fn(),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  tokens.access = null;
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

import {
  apiGet,
  apiPost,
  apiPostFormData,
  apiDelete,
  apiGetBlob,
  apiPostRaw,
} from "./apiClient";

function jsonResponse(status: number, body: unknown): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    text: async () => text,
    json: async () => body,
    blob: async () => new Blob([text]),
  } as unknown as Response;
}

describe("apiClient — base URL + auth header", () => {
  it("builds the URL from the configured base and the caller-supplied path", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await apiGet("/auth/me");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/auth\/me$/);
  });

  it("attaches the Bearer token when present", async () => {
    tokens.access = "tok-xyz";
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await apiGet("/auth/me");
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-xyz");
  });

  it("omits the Authorization header when skipAuth is true", async () => {
    tokens.access = "tok-xyz";
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await apiPost("/auth/login", { email: "a@b.c" }, { skipAuth: true });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("apiClient — POST / FormData / Blob", () => {
  it("serialises JSON bodies and sets Content-Type", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: "1" }));
    await apiPost("/auth/login", { email: "a@b.c" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ email: "a@b.c" }));
  });

  it("apiPostFormData omits Content-Type so the browser can set the multipart boundary", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { avatarUrl: "/a.png" }));
    const fd = new FormData();
    fd.append("avatar", new Blob(["x"]), "a.png");
    await apiPostFormData("/auth/me/avatar", fd);
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("apiGetBlob returns the raw blob (used by CSV/JSON exports)", async () => {
    const blob = new Blob(["hello"]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => blob,
      json: async () => ({}),
    } as unknown as Response);
    const out = await apiGetBlob("/gdpr/export");
    expect(out).toBeInstanceOf(Blob);
  });

  it("apiPostRaw returns the parsed JSON body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { url: "https://example/oauth" }));
    const data = await apiPostRaw<{ url: string }>("/auth/oauth/google/authorize", undefined, {
      skipAuth: true,
    });
    expect(data.url).toBe("https://example/oauth");
  });
});

describe("apiClient — error surface", () => {
  it("throws a structured error with message + code + status on 4xx", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { message: "Bad input", code: "INVALID_REQUEST" })
    );
    await expect(apiPost("/orgs", {})).rejects.toMatchObject({
      message: "Bad input",
      code: "INVALID_REQUEST",
      status: 400,
    });
  });

  it("apiDelete omits the body and serialises headers", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(204, {}));
    await apiDelete("/sessions/s1");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });
});