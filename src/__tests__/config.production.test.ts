import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We test validateConfig indirectly via loadConfig(), which calls it.
// loadConfig reads process.env at call time, so we manipulate env before each
// reset+re-import to get a fresh configInstance.

async function loadFreshConfig(): Promise<() => unknown> {
  vi.resetModules();
  const mod = await import("../config");
  return mod.loadConfig;
}

function setBaseEnv(): void {
  process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
  process.env.TOKEN_SECRET_HEX = "a".repeat(64);
  process.env.CSFLE_MASTER_KEY_HEX = "b".repeat(64);
}

describe("P4.3 — Production fail-fast config validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean slate for tested vars
    delete process.env.NODE_ENV;
    delete process.env.METRICS_AUTH_TOKEN;
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.REDIS_URI;
    delete process.env.BACKUP_ENCRYPTION_KEY_HEX;
    delete process.env.BACKUP_REQUIRE_ENCRYPTION;
    delete process.env.BACKUP_ENABLED;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("boots fine in development without prod-only env vars", async () => {
    process.env.NODE_ENV = "development";
    setBaseEnv();
    const loadConfig = await loadFreshConfig();
    expect(() => loadConfig()).not.toThrow();
  });

  it("refuses to boot in production without TOKEN_SECRET_HEX (H3)", async () => {
    process.env.NODE_ENV = "production";
    setBaseEnv();
    // Unset after setBaseEnv() so the module falls back to
    // generateSecureKey(32) — a 64-char generated key still satisfies the
    // length-only check, which is exactly the gap H3 closes: only an
    // explicit presence check catches "silently generated, never written
    // down" in production.
    delete process.env.TOKEN_SECRET_HEX;
    const loadConfig = await loadFreshConfig();
    expect(() => loadConfig()).toThrow(/TOKEN_SECRET_HEX is required in production/);
  });

  it("refuses to boot in production without CSFLE_MASTER_KEY_HEX (H3)", async () => {
    process.env.NODE_ENV = "production";
    setBaseEnv();
    delete process.env.CSFLE_MASTER_KEY_HEX;
    const loadConfig = await loadFreshConfig();
    expect(() => loadConfig()).toThrow(/CSFLE_MASTER_KEY_HEX is required in production/);
  });

  it("refuses to boot in production without METRICS_AUTH_TOKEN", async () => {
    process.env.NODE_ENV = "production";
    setBaseEnv();
    const loadConfig = await loadFreshConfig();
    expect(() => loadConfig()).toThrow(/METRICS_AUTH_TOKEN/);
  });

  it("refuses to boot in production without CORS_ALLOWED_ORIGINS", async () => {
    process.env.NODE_ENV = "production";
    setBaseEnv();
    process.env.METRICS_AUTH_TOKEN = "secret-token";
    const loadConfig = await loadFreshConfig();
    expect(() => loadConfig()).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it("refuses to boot in production without REDIS_URI", async () => {
    process.env.NODE_ENV = "production";
    setBaseEnv();
    process.env.METRICS_AUTH_TOKEN = "secret-token";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com";
    const loadConfig = await loadFreshConfig();
    expect(() => loadConfig()).toThrow(/REDIS_URI/);
  });

  it("refuses to boot in production without backup encryption keys", async () => {
    process.env.NODE_ENV = "production";
    setBaseEnv();
    process.env.METRICS_AUTH_TOKEN = "secret-token";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com";
    process.env.REDIS_URI = "redis://localhost:6379";
    const loadConfig = await loadFreshConfig();
    expect(() => loadConfig()).toThrow(/BACKUP_ENCRYPTION_KEY_HEX/);
  });

  it("allows production boot when all prod-only env vars are set", async () => {
    process.env.NODE_ENV = "production";
    setBaseEnv();
    process.env.METRICS_AUTH_TOKEN = "secret-token";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com";
    process.env.REDIS_URI = "redis://localhost:6379";
    process.env.BACKUP_ENCRYPTION_KEY_HEX = "c".repeat(64);
    process.env.BACKUP_REQUIRE_ENCRYPTION = "true";
    const loadConfig = await loadFreshConfig();
    expect(() => loadConfig()).not.toThrow();
  });

  it("allows production boot with backups explicitly disabled", async () => {
    process.env.NODE_ENV = "production";
    setBaseEnv();
    process.env.METRICS_AUTH_TOKEN = "secret-token";
    process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com";
    process.env.REDIS_URI = "redis://localhost:6379";
    process.env.BACKUP_ENABLED = "false";
    const loadConfig = await loadFreshConfig();
    expect(() => loadConfig()).not.toThrow();
  });
});

describe("H3 — ephemeral-secret warning outside production", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("warns when TOKEN_SECRET_HEX is unset in development", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
    process.env.CSFLE_MASTER_KEY_HEX = "b".repeat(64);
    delete process.env.TOKEN_SECRET_HEX;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loadConfig = await loadFreshConfig();
    loadConfig();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/TOKEN_SECRET_HEX not set/));
  });

  it("warns when CSFLE_MASTER_KEY_HEX is unset in development", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
    process.env.TOKEN_SECRET_HEX = "a".repeat(64);
    delete process.env.CSFLE_MASTER_KEY_HEX;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loadConfig = await loadFreshConfig();
    loadConfig();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/CSFLE_MASTER_KEY_HEX not set/));
  });

  it("does not warn when both secrets are explicitly set", async () => {
    process.env.NODE_ENV = "development";
    setBaseEnv();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loadConfig = await loadFreshConfig();
    loadConfig();

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/TOKEN_SECRET_HEX/));
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/CSFLE_MASTER_KEY_HEX/));
  });
});

describe("P3.3 — Elasticsearch optional by default", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults elasticsearch.enabled to false when ELASTICSEARCH_ENABLED is unset", async () => {
    process.env.NODE_ENV = "development";
    setBaseEnv();
    delete process.env.ELASTICSEARCH_ENABLED;
    const loadConfig = await loadFreshConfig();
    const config = loadConfig() as { elasticsearch: { enabled: boolean } };
    expect(config.elasticsearch.enabled).toBe(false);
  });

  it("enables elasticsearch only when ELASTICSEARCH_ENABLED=true", async () => {
    process.env.NODE_ENV = "development";
    setBaseEnv();
    process.env.ELASTICSEARCH_ENABLED = "true";
    const loadConfig = await loadFreshConfig();
    const config = loadConfig() as { elasticsearch: { enabled: boolean } };
    expect(config.elasticsearch.enabled).toBe(true);
  });
});
