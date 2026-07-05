import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Repo root (two levels up from packages/ui), so the webServer can launch the
// full `bun dev` stack (API on :1337 + UI on :3000).
const repoRoot = path.resolve(__dirname, "..", "..");

export default defineConfig({
  testDir: "./e2e",
  // E2E specs are intentionally serial-friendly; keep workers modest so the
  // shared dev backend isn't hammered.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  // Prefer the user-level browser cache on Windows dev machines (sandbox installs
  // land in a temp path that Playwright test runs may not see).
  ...(process.platform === "win32" && process.env.LOCALAPPDATA
    ? { cacheDir: `${process.env.LOCALAPPDATA}/ms-playwright` }
    : {}),

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Boots the whole app. NEXT_PUBLIC_ZEROTRUST_URL points the UI's API client at
  // the API on :1337 (its default is :3000, which only serves the Next.js app).
  // HIBP_CHECK_ENABLED=false keeps registration deterministic offline (the live
  // HaveIBeenPwned check would otherwise reject some passwords).
  webServer: {
    command: "bun run dev",
    cwd: repoRoot,
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_ZEROTRUST_URL: "http://localhost:1337",
      HIBP_CHECK_ENABLED: "false",
      RATE_LIMITING_ENABLED: "false",
    },
  },
});
