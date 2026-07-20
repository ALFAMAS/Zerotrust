import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Playwright-generated artifacts (auth storage state, screenshots, traces) must
 * live OUTSIDE `packages/ui`. The E2E webServer runs the UI with `next dev`,
 * whose file watcher treats any write under the project directory as a source
 * change. Writing auth JSON / screenshots into `packages/ui/e2e/.auth` or
 * `packages/ui/test-results` mid-run triggers a Fast Refresh recompile and full
 * page reload, which destroys the page's execution context and makes
 * interaction-heavy specs (e.g. the command palette) time out. Keeping these
 * files at the repo root removes them from the dev server's watch scope.
 *
 * __dirname here is `<repo>/packages/ui/e2e/fixtures`, so four levels up is the
 * repo root.
 */
export const E2E_ARTIFACT_DIR = path.resolve(__dirname, "..", "..", "..", "..", ".e2e-artifacts");
export const E2E_AUTH_DIR = path.join(E2E_ARTIFACT_DIR, "auth");
export const E2E_OUTPUT_DIR = path.join(E2E_ARTIFACT_DIR, "test-results");

/** Absolute path to a named auth storage-state file, creating its dir. */
export function e2eAuthFile(name: string): string {
  mkdirSync(E2E_AUTH_DIR, { recursive: true });
  return path.join(E2E_AUTH_DIR, `${name}.json`);
}
