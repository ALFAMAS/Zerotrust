import { describe, expect, it, vi } from "vitest";

import { resolveBackgroundJobTopology, warnIfApiRunsSchedulersInProduction } from "../jobs/topology";

describe("production worker topology enforcement", () => {
  it("defers API schedulers when WORKER_MODE=true", () => {
    expect(resolveBackgroundJobTopology({ NODE_ENV: "production", WORKER_MODE: "true" })).toEqual({
      startInApiProcess: false,
      workerMode: true,
      production: true,
    });
  });

  it("warns when a production API process would start schedulers without a dedicated worker", () => {
    const warn = vi.fn();
    const logger = { warn };

    const topology = resolveBackgroundJobTopology({ NODE_ENV: "production", WORKER_MODE: undefined });
    warnIfApiRunsSchedulersInProduction(logger, topology);

    expect(topology.startInApiProcess).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      "Production API process is starting background schedulers because WORKER_MODE is not true; run API replicas with WORKER_MODE=true and exactly one dedicated worker via bun run src/worker.ts"
    );
  });

  it("does not warn for local single-process development", () => {
    const warn = vi.fn();
    const topology = resolveBackgroundJobTopology({ NODE_ENV: "development", WORKER_MODE: undefined });

    warnIfApiRunsSchedulersInProduction({ warn }, topology);

    expect(topology.startInApiProcess).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
