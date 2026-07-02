import { describe, expect, it, vi } from "vitest";
import { register } from "prom-client";

describe("SLO service metrics registration", () => {
  it("can reload custom counters against the same registry", async () => {
    vi.resetModules();
    const { metricsRegistry } = await import("../metrics/registry");

    metricsRegistry.clear();
    await import("../metrics/counters");

    vi.resetModules();
    vi.doMock("../metrics/registry", () => ({ metricsRegistry }));

    await expect(import("../metrics/counters")).resolves.toBeDefined();
    vi.doUnmock("../metrics/registry");
  });

  it("can reload metrics middleware without duplicate default metrics", async () => {
    vi.resetModules();
    register.clear();

    await import("../metrics/middleware");

    vi.resetModules();

    await expect(import("../metrics/middleware")).resolves.toBeDefined();
  });

  it("can be imported after metrics middleware without duplicate default metrics", async () => {
    vi.resetModules();
    register.clear();

    await import("../metrics/middleware");

    await expect(import("../services/ops/slo.service")).resolves.toBeDefined();
  });
});
