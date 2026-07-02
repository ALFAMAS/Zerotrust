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
      reporter: ["text", "json-summary", "html"],
      include: ["src/lib/server-state/**/*.ts"],
      exclude: [
        "node_modules/",
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "e2e/**",
        "src/app/**/layout.tsx",
        "src/app/**/loading.tsx",
        "src/app/**/error.tsx",
        "src/app/**/not-found.tsx",
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 55,
        statements: 85,
      },
    },
  },
});
