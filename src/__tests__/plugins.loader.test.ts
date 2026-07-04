import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { resolveEnabledPluginIds } from "../plugins/config";
import { discoverPluginIds } from "../plugins/discover";
import { loadPlugins } from "../plugins/loader";
import type { HonoEnv } from "../shared/types";

describe("plugin discovery", () => {
  it("discovers magic-link, mfa, and oauth in the real plugins/ directory", () => {
    const ids = discoverPluginIds(process.cwd());
    expect(ids).toContain("magic-link");
    expect(ids).toContain("mfa");
    expect(ids).toContain("oauth");
  });
});

describe("resolveEnabledPluginIds", () => {
  it("enables all discovered plugins by default", () => {
    const ids = resolveEnabledPluginIds(["magic-link", "mfa"], {});
    expect(ids).toEqual(["magic-link", "mfa"]);
  });

  it("respects ENABLED_PLUGINS allowlist", () => {
    const ids = resolveEnabledPluginIds(["magic-link", "mfa"], {
      ENABLED_PLUGINS: "magic-link",
    });
    expect(ids).toEqual(["magic-link"]);
  });

  it("respects DISABLED_PLUGINS denylist", () => {
    const ids = resolveEnabledPluginIds(["magic-link", "mfa"], {
      DISABLED_PLUGINS: "mfa",
    });
    expect(ids).toEqual(["magic-link"]);
  });
});

describe("loadPlugins", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `zt-plugins-${Date.now()}`);
    mkdirSync(join(tempDir, "plugins", "demo"), { recursive: true });
    writeFileSync(
      join(tempDir, "plugins", "demo", "index.ts"),
      `
      const plugin = {
        manifest: { id: "demo", name: "Demo", version: "0.0.1" },
        register(ctx) { ctx.app.get("/demo-plugin-ping", (c) => c.json({ ok: true })); },
      };
      export default plugin;
    `
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads a plugin from a temp plugins/ directory", async () => {
    vi.stubEnv("ENABLED_PLUGINS", "demo");
    const app = new Hono<HonoEnv>();
    const result = await loadPlugins(app, { cwd: tempDir, failFast: true });
    expect(result.loaded.map((p) => p.manifest.id)).toEqual(["demo"]);
    expect(result.errors).toHaveLength(0);

    const res = await app.request("/demo-plugin-ping");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
