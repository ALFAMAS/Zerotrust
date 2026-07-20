import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Repo root (two levels up from packages/ui), so the webServer can launch the
// full `bun dev` stack (API on :1337 + UI on :3000).
const repoRoot = path.resolve(__dirname, "..", "..");
const reuseExistingServer = process.env.E2E_REUSE_SERVER === "true";
const isolatedStack = process.env.E2E_ISOLATED_STACK === "true";
const apiUrl = isolatedStack ? "http://localhost:1437" : "http://localhost:1337";
const appUrl = isolatedStack ? "http://localhost:3100" : "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // E2E specs are intentionally serial-friendly; keep workers modest so the
  // shared dev backend isn't hammered.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: appUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  // Prefer the user-level browser cache on Windows dev machines (sandbox installs
  // land in a temp path that Playwright test runs may not see).
  ...(process.platform === "win32" && process.env.LOCALAPPDATA
    ? { cacheDir: `${process.env.LOCALAPPDATA}/ms-playwright` }
    : {}),

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Launch and probe both services independently. Waiting only for Next.js can
  // race the API during cold starts, causing the first auth flow to reach the
  // proof-of-work endpoint before :1337 is ready.
  webServer: [
    {
      command: "bun run dev:api",
      cwd: repoRoot,
      url: `${apiUrl}/health`,
      reuseExistingServer,
      timeout: 240_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        NODE_ENV: "development",
        HIBP_CHECK_ENABLED: "false",
        RATE_LIMITING_ENABLED: "false",
        PORT: isolatedStack ? "1437" : "1337",
        APP_URL: appUrl,
        CORS_ALLOWED_ORIGINS: appUrl,
      },
    },
    {
      command: isolatedStack ? "bunx next dev -p 3100" : "bun run dev:ui",
      cwd: isolatedStack ? path.resolve(repoRoot, "packages", "ui") : repoRoot,
      url: appUrl,
      reuseExistingServer,
      timeout: 240_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        NODE_ENV: "development",
        NEXT_PUBLIC_ZEROTRUST_URL: apiUrl,
        NEXT_PUBLIC_APP_URL: appUrl,
        ...(isolatedStack ? { ZEROTRUST_NEXT_DIST_DIR: ".next-e2e" } : {}),
      },
    },
  ],
});
