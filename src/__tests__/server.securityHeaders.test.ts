import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serverTsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../api/server.ts");

function mockServerDependencies() {
  vi.doMock("..", () => ({
    initializezerotrust: vi.fn().mockResolvedValue({
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    }),
  }));
  vi.doMock("../instrument", () => ({ initSentry: vi.fn() }));
  vi.doMock("../telemetry", () => ({
    initTelemetry: vi.fn(),
    telemetryMiddleware: () => async (_c: unknown, next: () => Promise<void>) => next(),
  }));
  vi.doMock("../jobs/scheduler", () => ({
    startJobScheduler: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock("../services/billing/stripeWebhookQueue", () => ({
    initStripeWebhookQueueProducer: vi.fn(),
    initStripeWebhookQueueConsumer: vi.fn(),
  }));
  vi.doMock("../services/notifications/emailQueue", () => ({
    initEmailQueue: vi.fn().mockResolvedValue(undefined),
  }));
}

function stubProductionEnv(apiDocsEnabled: "true" | "false") {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("API_DOCS_ENABLED", apiDocsEnabled);
  vi.stubEnv("TOKEN_SECRET_HEX", "ab".repeat(32));
  vi.stubEnv("CSFLE_MASTER_KEY_HEX", "cd".repeat(32));
  vi.stubEnv(
    "BACKUP_ENCRYPTION_KEY_HEX",
    "7d4e8f21a36bc905f174d2ea60b893c64f0ad7e31295c86bde4071fa529c3e68"
  );
  vi.stubEnv("METRICS_AUTH_TOKEN", "production-test-metrics-token");
  vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://app.example.com");
  vi.stubEnv("REDIS_URI", "redis://localhost:6379");
  vi.stubEnv("UNSUBSCRIBE_SECRET", "production-test-unsubscribe-secret");
  vi.stubEnv("BACKUP_ENABLED", "false");
}

describe("createServer security headers (ZT-2)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("WORKER_MODE", "true");
    vi.stubEnv(
      "DATABASE_URL",
      process.env.DATABASE_URL ?? "postgresql://zerotrust:password@localhost:5432/zerotrust_test"
    );
  });

  it(
    "sends Content-Security-Policy on the real app /health route",
    async () => {
      mockServerDependencies();

      const { createServer } = await import("../api/server");
      const app = await createServer();
      const res = await app.request("/health");
      expect(res.status).toBeLessThan(600);
      expect(res.headers.get("content-security-policy")).toBeTruthy();
      expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(res.headers.get("strict-transport-security")).toMatch(/max-age=/);
      expect(res.headers.get("x-frame-options")).toBe("DENY");
    },
    30_000
  );

  it("wires securityHeaders middleware in server.ts (not bare secureHeaders)", () => {
    const src = readFileSync(serverTsPath, "utf8");
    expect(src).toContain('app.use("*", securityHeaders())');
    expect(src).not.toMatch(/app\.use\("\*",\s*secureHeaders\(\)\)/);
  });

  it("overrides CSP on /docs for Scalar (dev/test only)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    mockServerDependencies();

    const { createServer } = await import("../api/server");
    const app = await createServer();

    const docs = await app.request("/docs");
    expect(docs.status).toBe(200);
    const docsCsp = docs.headers.get("content-security-policy") ?? "";
    expect(docsCsp).toContain("https://cdn.jsdelivr.net");
    expect(docsCsp).toMatch(/'nonce-[A-Za-z0-9_-]+'/);
    expect(docsCsp).not.toMatch(/script-src[^;]*'unsafe-inline'/);

    const html = await docs.text();
    expect(html).toContain("cdn.jsdelivr.net/npm/@scalar/api-reference");
    expect(html).toMatch(/nonce="[A-Za-z0-9_-]+"/);

    const health = await app.request("/health");
    const healthCsp = health.headers.get("content-security-policy") ?? "";
    expect(healthCsp).toContain("script-src 'self'");
    expect(healthCsp).not.toContain("cdn.jsdelivr.net");
  }, 30_000);

  it("keeps API docs disabled in production by default", async () => {
    stubProductionEnv("false");
    mockServerDependencies();

    const { createServer } = await import("../api/server");
    const app = await createServer();

    expect((await app.request("/docs")).status).toBe(404);
    expect((await app.request("/openapi.json")).status).toBe(404);
  }, 30_000);

  it("mounts API docs in production only when explicitly enabled", async () => {
    stubProductionEnv("true");
    mockServerDependencies();

    const { createServer } = await import("../api/server");
    const app = await createServer();

    expect((await app.request("/docs")).status).toBe(200);
    expect((await app.request("/openapi.json")).status).toBe(200);
  }, 30_000);

  it("does not mount orphaned /admin/tenants routes (ARCH-1)", () => {
    const src = readFileSync(serverTsPath, "utf8");
    expect(src).not.toContain("/admin/tenants");
    expect(src).not.toContain("tenant.routes");
  });
});
