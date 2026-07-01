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
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
    testTimeout: 10000,
  },
});
