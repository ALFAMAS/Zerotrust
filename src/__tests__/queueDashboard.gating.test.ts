import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  addQueueDashboardNonce,
  buildQueueDashboardCsp,
  isQueueDashboardEnabled,
} from "../jobs/queueDashboard";

describe("queue dashboard gating", () => {
  it("is automatic outside production and explicit in production", () => {
    expect(isQueueDashboardEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isQueueDashboardEnabled({ NODE_ENV: "test" })).toBe(true);
    expect(isQueueDashboardEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(
      isQueueDashboardEnabled({ NODE_ENV: "production", QUEUE_DASHBOARD_ENABLED: "true" })
    ).toBe(true);
  });

  it("mounts the dashboard behind both existing admin guards", () => {
    const serverPath = resolve(dirname(fileURLToPath(import.meta.url)), "../api/server.ts");
    const source = readFileSync(serverPath, "utf8");

    expect(source).toContain('app.route("/admin/queues", queueDashboard)');
    expect(source).toMatch(/queueDashboard\.use\("\*",\s*authMiddleware,\s*requireAdmin\)/);
  });

  it("nonces Bull Board's inline config script without allowing inline scripts", () => {
    const html =
      '<script id="__UI_CONFIG__" type="application/json">{}</script><style>.x{}</style>';
    expect(addQueueDashboardNonce(html, "test-nonce")).toContain(
      '<script nonce="test-nonce" id="__UI_CONFIG__"'
    );
    expect(addQueueDashboardNonce(html, "test-nonce")).toContain(
      '<style nonce="test-nonce">'
    );

    const csp = buildQueueDashboardCsp("test-nonce");
    expect(csp).toContain("script-src 'self' 'nonce-test-nonce'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});
