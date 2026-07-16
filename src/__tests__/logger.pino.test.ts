import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/shared/siem.service", () => ({
  streamToSiem: vi.fn().mockResolvedValue(false),
}));

vi.mock("../config", () => ({
  getConfig: () => ({
    logging: { level: "info", format: "json" },
    elasticsearch: {
      enabled: false,
      host: "localhost",
      port: 9200,
      indexPrefix: "zerotrust",
    },
  }),
}));

describe("Pino logger compatibility wrapper", () => {
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((() => true) as typeof process.stdout.write);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("preserves the structured field contract and applies layered redaction", async () => {
    const { getLogger } = await import("../logger");
    const logger = getLogger("auth-service");
    logger.setCorrelationId("req-1");
    logger.info("Login checked", {
      userId: "user-1",
      password: "do-not-log",
      nested: { access_token: "token-value" },
      note: "Authorization=Bearer abc.def",
    });

    const line = String(stdout.mock.calls.at(-1)?.[0]);
    const entry = JSON.parse(line) as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: "info",
      message: "Login checked",
      module: "auth-service",
      correlationId: "req-1",
      userId: "user-1",
      password: "[REDACTED]",
      nested: { access_token: "[REDACTED]" },
    });
    expect(entry.timestamp).toEqual(expect.any(String));
    expect(entry).not.toHaveProperty("msg");
    expect(entry).not.toHaveProperty("pid");
    expect(entry).not.toHaveProperty("hostname");
    expect(JSON.stringify(entry)).not.toContain("abc.def");
  });

  it("uses Pino's safe serializer for values JSON.stringify cannot handle", async () => {
    const { getLogger } = await import("../logger");
    const logger = getLogger("billing");

    expect(() => logger.info("Large counter", { counter: 42n })).not.toThrow();
    expect(String(stdout.mock.calls.at(-1)?.[0])).toContain('"counter":42');
  });

  it("delegates minimum-level filtering without changing the wrapper API", async () => {
    const { getLogger } = await import("../logger");
    const logger = getLogger("quiet-module");

    logger.debug("hidden");
    expect(stdout).not.toHaveBeenCalled();
  });
});
