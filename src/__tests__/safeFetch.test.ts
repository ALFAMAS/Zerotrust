import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSafeFetchUrl, fetchFixedUrl, fetchPublicUrl } from "../shared/safeFetch";

describe("safeFetch", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("rejects public fetches to SSRF-sensitive hosts before network I/O", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;

    await expect(fetchPublicUrl("http://127.0.0.1/latest/meta-data")).rejects.toThrow(
      /SSRF guard/
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forces timeout and redirect refusal for public URL fetches", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = fetchSpy as any;

    await fetchPublicUrl("https://example.com/resource", {
      headers: { Accept: "application/json" },
      timeoutMs: 1234,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://example.com/resource");
    expect((init as RequestInit).redirect).toBe("error");
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
    expect((init as RequestInit).headers).toEqual({ Accept: "application/json" });
  });

  it("forces timeout and redirect refusal for fixed/provider URL fetches without public-host guarding", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = fetchSpy as any;

    await fetchFixedUrl("http://127.0.0.1:9200/_cluster/health", { timeoutMs: 321 });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:9200/_cluster/health");
    expect((init as RequestInit).redirect).toBe("error");
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects non-default ports in user-influenced URLs", () => {
    expect(() => assertSafeFetchUrl("https://example.com:4443/path")).toThrow(/non-default port/);
  });
});
