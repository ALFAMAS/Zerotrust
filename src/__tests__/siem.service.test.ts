import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isSiemEnabled, streamToSiem } from "../services/shared/siem.service";

const ENV = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.SIEM_ENABLED;
  delete process.env.SIEM_ENDPOINT;
  delete process.env.SIEM_AUTH_HEADER;
  delete process.env.SIEM_API_KEY;
  delete process.env.SIEM_SOURCE;
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("SIEM streaming", () => {
  it("is disabled without config and never calls fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null));
    expect(isSiemEnabled()).toBe(false);
    expect(await streamToSiem({ action: "x" })).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts the event to the configured endpoint with auth + source", async () => {
    process.env.SIEM_ENABLED = "true";
    process.env.SIEM_ENDPOINT = "https://collector.test/intake";
    process.env.SIEM_AUTH_HEADER = "DD-API-KEY";
    process.env.SIEM_API_KEY = "secret-key";
    process.env.SIEM_SOURCE = "zerotrust-test";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null));
    const ok = await streamToSiem({ action: "user.login", actor: "u1" });
    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://collector.test/intake");
    expect((init as any).method).toBe("POST");
    expect((init as any).headers["DD-API-KEY"]).toBe("secret-key");
    const body = JSON.parse((init as any).body);
    expect(body.action).toBe("user.login");
    expect(body.source).toBe("zerotrust-test");
    expect(body["@timestamp"]).toBeTruthy();
  });

  it("swallows delivery errors and returns false", async () => {
    process.env.SIEM_ENABLED = "true";
    process.env.SIEM_ENDPOINT = "https://collector.test/intake";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await streamToSiem({ action: "x" })).toBe(false);
  });

  it("requires both SIEM_ENABLED and an endpoint", async () => {
    process.env.SIEM_ENABLED = "true";
    expect(isSiemEnabled()).toBe(false); // no endpoint
    process.env.SIEM_ENDPOINT = "https://collector.test/intake";
    expect(isSiemEnabled()).toBe(true);
  });
});
