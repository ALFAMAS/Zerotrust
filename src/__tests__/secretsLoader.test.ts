import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

describe("secretsLoader", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.SECRETS_PROVIDER;
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_TOKEN;
    delete process.env.DOPPLER_TOKEN;
    delete process.env.AWS_SECRET_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("env provider is a no-op", async () => {
    const { loadSecrets } = await import("../config/secretsLoader");
    const secrets = await loadSecrets({ SECRETS_PROVIDER: "env", NODE_ENV: "test" });
    expect(secrets).toEqual({});
  });

  it("overlays Vault KV v2 secrets into unset env vars", async () => {
    delete process.env.OVERLAY_TEST_SECRET;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { data: { OVERLAY_TEST_SECRET: "overlay-value" } },
        }),
      })
    );

    const { loadSecrets } = await import("../config/secretsLoader");
    await loadSecrets({
      SECRETS_PROVIDER: "vault",
      VAULT_ADDR: "https://vault.example.com",
      VAULT_TOKEN: "test-token",
      VAULT_MOUNT: "secret",
      VAULT_SECRET_PATH: "zerotrust",
      NODE_ENV: "test",
    });

    expect(process.env.OVERLAY_TEST_SECRET).toBe("overlay-value");
    expect(fetch).toHaveBeenCalledWith(
      "https://vault.example.com/v1/secret/data/zerotrust",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Vault-Token": "test-token" }),
      })
    );
  });

  it("does not overwrite existing env vars from Doppler", async () => {
    process.env.DATABASE_URL = "postgresql://local/existing";
    // The CI Tests job exports REDIS_URI for its Redis service container;
    // clear it so the loader's fill-when-unset path is exercised.
    delete process.env.REDIS_URI;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          DATABASE_URL: "postgresql://remote/new",
          REDIS_URI: "redis://remote:6379",
        }),
      })
    );

    const { loadSecrets } = await import("../config/secretsLoader");
    await loadSecrets({
      SECRETS_PROVIDER: "doppler",
      DOPPLER_TOKEN: "dp.st.test",
      NODE_ENV: "test",
    });

    expect(process.env.DATABASE_URL).toBe("postgresql://local/existing");
    expect(process.env.REDIS_URI).toBe("redis://remote:6379");
  });

  it("rejects unknown SECRETS_PROVIDER values", async () => {
    const { loadSecrets } = await import("../config/secretsLoader");
    await expect(loadSecrets({ SECRETS_PROVIDER: "infisical", NODE_ENV: "test" })).rejects.toThrow(
      /Unknown SECRETS_PROVIDER/
    );
  });
});
