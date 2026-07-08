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
      // DQ-2: Coverage ratchet should track the UI test surface that is
      // realistically exercised by this Vitest project (happy-dom +
      // Testing Library), not the entire Next.js route tree.
      include: [
        "src/lib/server-state/**/*.{tsx,ts}",
        "src/components/ui/**/*.{tsx,ts}",
        "src/app/**/*Client.{tsx,ts}",
      ],
      exclude: ["**/*.test.tsx", "**/*.test.ts", "src/test/**"],
      // UI ratchet (DQ-2): floors aligned to measured baseline (~54.6% lines).
      thresholds: {
        lines: 54,
        functions: 52,
        branches: 46,
        statements: 51,
      },
    },
  },
});
