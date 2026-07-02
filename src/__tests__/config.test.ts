import { afterEach, describe, expect, it, vi } from "vitest";

describe("config elasticsearch defaults", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.ELASTICSEARCH_ENABLED;
  });

  it("defaults elasticsearch.enabled to false when ELASTICSEARCH_ENABLED is unset", async () => {
    delete process.env.ELASTICSEARCH_ENABLED;
    vi.resetModules();
    const { loadConfig, resetConfig } = await import("../config");
    resetConfig();
    const config = loadConfig();
    expect(config.elasticsearch.enabled).toBe(false);
  });

  it("enables elasticsearch only when ELASTICSEARCH_ENABLED=true", async () => {
    process.env.ELASTICSEARCH_ENABLED = "true";
    vi.resetModules();
    const { loadConfig, resetConfig } = await import("../config");
    resetConfig();
    const config = loadConfig();
    expect(config.elasticsearch.enabled).toBe(true);
  });
});
