// Vitest global setup — runs inside every test worker before any test module
// is imported. Several test files (e.g. mfa.test.ts, api-keys.routes.test.ts)
// import application modules that call getConfig() at module-load time. If the
// required secrets are not present in the worker's environment, config
// validation throws during import and poisons the whole worker, cascading into
// unrelated failures (auth.routes, etc.).
//
// CI sets these as job-level env vars, but they are not reliably propagated
// into Vitest's fork-pool worker processes. Setting them here makes the suite
// self-contained and deterministic regardless of how the environment is wired.

// 64 hex chars = 32 bytes — satisfies the length check in src/config/index.ts.
const TEST_KEY = "0".repeat(64);

function ensureEnv(name: string, value: string): void {
  const current = process.env[name];
  // Only fill in when missing or invalid (too short) so an explicitly provided
  // value from the environment still wins.
  if (!current || current.length < 64) {
    process.env[name] = value;
  }
}

ensureEnv("TOKEN_SECRET_HEX", TEST_KEY);
ensureEnv("CSFLE_MASTER_KEY_HEX", TEST_KEY);

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}
