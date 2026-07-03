// @ts-nocheck
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["src/__tests__/setup.ts"],
    // React component tests (.tsx) run under packages/ui/vitest.config.ts
    // instead (happy-dom + Testing Library) — this config stays environment:
    // "node" for the API suite and packages/ui's plain-logic .ts tests
    // (lib/*.test.ts), so it can't run DOM-rendering tests correctly.
    include: ["src/**/*.{test,spec}.ts", "packages/ui/src/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "json-summary"],
      exclude: ["node_modules/", "src/__tests__/setup.ts", "src/**/*.test.ts", "src/**/*.spec.ts"],
      // Ratchet thresholds (T5 increment, 2026-07-04): measured coverage is ~66.6%
      // lines, ~65.2% statements, ~59.7% branches, ~61.8% functions (after
      // plans.ts, apiHelpers ok/fail/dbGuard tests).
      // Floors sit at or just below baseline; raise toward 85% long-term target.
      thresholds: {
        lines: 66,
        functions: 61,
        branches: 59,
        statements: 65,
      },
    },
    testTimeout: 10000,
  },
});
