import { afterEach, describe, expect, it, vi } from "vitest";
import { connectAuthenticatedSse } from "./sseClient";

describe("connectAuthenticatedSse", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends Authorization header and never appends token to URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('event: connected\ndata: {"userId":"u1"}\n\n'),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const events: Array<{ event: string; data: string }> = [];
    const disconnect = connectAuthenticatedSse({
      url: "http://localhost:1337/notifications/sse",
      getToken: () => "secret-access-token",
      onEvent: (event, data) => events.push({ event, data }),
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:1337/notifications/sse");
    expect(url).not.toContain("token=");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-access-token");

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]?.event).toBe("connected");

    disconnect();
  });

  it("does not connect when no token is available", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const disconnect = connectAuthenticatedSse({
      url: "http://localhost:1337/notifications/sse",
      getToken: () => null,
      onEvent: () => {},
    });

    expect(fetchMock).not.toHaveBeenCalled();
    disconnect();
  });
});
