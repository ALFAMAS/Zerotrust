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
    include: [
      "src/**/*.{test,spec}.ts",
      "packages/ui/src/**/*.{test,spec}.ts",
      "packages/shared-types/src/**/*.test.ts",
    ],
    exclude: ["node_modules", "dist", "src/**/*.container.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "json-summary"],
      exclude: ["node_modules/", "src/__tests__/setup.ts", "src/**/*.test.ts", "src/**/*.spec.ts"],
      // Ratchet thresholds (DQ-2): floors at or below measured baseline (~64.6% lines).
      thresholds: {
        lines: 64,
        functions: 61,
        branches: 55,
        statements: 63,
      },
    },
    testTimeout: 10000,
  },
});
