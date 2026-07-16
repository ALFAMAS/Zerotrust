import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["src/__tests__/setup.ts"],
    globalSetup: ["tests/integration/testcontainers.globalSetup.ts"],
    include: ["src/**/*.container.test.ts", "src/__tests__/wallet.repository.concurrency.test.ts"],
    exclude: ["node_modules", "dist"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
