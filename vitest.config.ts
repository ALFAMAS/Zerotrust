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
      // Ratchet thresholds (P3.8): measured coverage as of 2026-07-03 is
      // ~64% lines/statements, ~56% branches, ~60% functions. Floors sit at or
      // just below baseline so CI stays green; raise toward 85% long-term target.
      thresholds: {
        lines: 64,
        functions: 59,
        branches: 56,
        statements: 62,
      },
    },
    testTimeout: 10000,
  },
});
