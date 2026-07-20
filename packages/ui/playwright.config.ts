import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Repo root (two levels up from packages/ui), so the webServer can launch the
// full `bun dev` stack (API on :1337 + UI on :3000).
const repoRoot = path.resolve(__dirname, "..", "..");
const reuseExistingServer = process.env.E2E_REUSE_SERVER === "true";
const isolatedStack = process.env.E2E_ISOLATED_STACK === "true";
const apiUrl = isolatedStack ? "http://localhost:1437" : "http://localhost:1337";
const appUrl = isolatedStack ? "http://localhost:3100" : "http://localhost:3000";

// In CI, serve the UI from a production build (`next build` + `next start`)
// instead of `next dev`. The dev server's HMR/Fast Refresh continuously reloads
// the page under CI, destroying the page's execution context mid-test and timing
// out interaction-heavy specs (e.g. the command palette). A production build has
// no HMR, so the reload storm cannot occur. Local runs keep `next dev` for fast
// iteration. The isolated-stack path (opt-in) is unchanged.
const useProdUiBuild = !!process.env.CI && !isolatedStack;
const uiCommand = isolatedStack
  ? "bunx next dev -p 3100"
  : useProdUiBuild
    ? "bun run --cwd packages/ui build && bun run --cwd packages/ui start"
    : "bun run dev:ui";

export default defineConfig({
  testDir: "./e2e",
  // Keep generated artifacts (screenshots, traces, error context) OUT of
  // packages/ui. The E2E webServer runs the UI with `next dev`, whose file
  // watcher treats writes under the project dir as source changes — a
  // screenshot/trace written mid-run triggers a Fast Refresh reload that
  // destroys the page's execution context and times out the active test.
  outputDir: path.resolve(repoRoot, ".e2e-artifacts", "test-results"),
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
      command: uiCommand,
      cwd: isolatedStack ? path.resolve(repoRoot, "packages", "ui") : repoRoot,
      url: appUrl,
      reuseExistingServer,
      timeout: 240_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        // A production build (CI) must not run in development mode or Next keeps
        // HMR/Fast Refresh enabled. Local/isolated runs stay in development.
        NODE_ENV: useProdUiBuild ? "production" : "development",
        NEXT_PUBLIC_ZEROTRUST_URL: apiUrl,
        NEXT_PUBLIC_APP_URL: appUrl,
        ...(isolatedStack ? { ZEROTRUST_NEXT_DIST_DIR: ".next-e2e" } : {}),
      },
    },
  ],
});
