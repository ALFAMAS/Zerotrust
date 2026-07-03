import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Separate from the root vitest.config.ts (which runs the API suite under
// environment: "node"): React component tests need a DOM. Keeping this as its
// own project avoids forcing a DOM environment on every backend test file.
// The root config's include pattern only picks up packages/ui/src/**/*.test.ts
// (plain logic, e.g. lib/*.test.ts) — .tsx component tests live here instead.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.tsx"],
    exclude: ["node_modules", "e2e"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/app/**/*.{tsx,ts}", "src/components/**/*.{tsx,ts}", "src/lib/**/*.{tsx,ts}"],
      exclude: ["**/*.test.tsx", "**/*.test.ts", "src/test/**"],
      // UI page/component ratchet (B4/T5): measured 2026-07-04 is ~53.9% lines,
      // ~51.3% statements, ~51.4% functions, ~46.1% branches on app/ pages —
      // floors sit at or just below baseline; raise toward 85% as page tests expand.
      thresholds: {
        lines: 53,
        functions: 51,
        branches: 46,
        statements: 51,
      },
    },
  },
});
