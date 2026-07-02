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
      // Ratchet thresholds (todo.md P4.5): actual coverage as of 2026-07-01 is
      // ~60-62% lines/statements/functions, ~56% branches — nowhere near the
      // aspirational 85% (which made the gate permanently non-blocking and
      // therefore meaningless — see ci.yml). These floors sit a few points
      // below the measured baseline so normal fluctuation doesn't flake CI,
      // but a real regression still fails the build. Raise them as coverage
      // improves; 85% remains the long-term target (see docs/AUDIT.md /
      // the quarterly maintenance scorecard, todo.md P4.2).
      thresholds: {
        lines: 60,
        functions: 58,
        branches: 55,
        statements: 59,
      },
    },
    testTimeout: 10000,
  },
});
