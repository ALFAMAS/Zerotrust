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
      // Ratchet thresholds (todo.md P3.1): measured coverage as of 2026-07-03 is
      // ~63-64% lines/statements/functions, ~56% branches. Floors sit a few points
      // below baseline so normal fluctuation doesn't flake CI; raise incrementally
      // toward the 85% long-term target (see docs/maintenance-scorecard.md §3).
      thresholds: {
        lines: 63,
        functions: 61,
        branches: 56,
        statements: 62,
      },
    },
    testTimeout: 10000,
  },
});
