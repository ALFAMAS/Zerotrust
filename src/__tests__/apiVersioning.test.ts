import { describe, it, expect, afterEach } from "vitest";
import { Hono } from "hono";
import {
  apiVersioning,
  resolveRequestedVersion,
  CURRENT_API_VERSION,
  API_VERSIONS,
  type ApiVersion,
} from "../middleware/apiVersioning";

function appWith() {
  const app = new Hono();
  app.use("*", apiVersioning());
  app.get("/thing", (c) => c.json({ ok: true }));
  return app;
}

// Temporarily register extra versions for lifecycle tests, then restore.
const original = [...API_VERSIONS];
function setVersions(extra: ApiVersion[]) {
  API_VERSIONS.push(...extra);
}
afterEach(() => {
  API_VERSIONS.length = 0;
  API_VERSIONS.push(...original);
});

describe("resolveRequestedVersion", () => {
  it("prefers a /vN path prefix", () => {
    expect(resolveRequestedVersion("/v2/users", "v9")).toBe("v2");
  });
  it("falls back to the X-API-Version header", () => {
    expect(resolveRequestedVersion("/users", "V3")).toBe("v3");
  });
  it("defaults to the current version", () => {
    expect(resolveRequestedVersion("/users", null)).toBe(CURRENT_API_VERSION);
  });
});

describe("apiVersioning middleware", () => {
  it("echoes the negotiated version and adds no deprecation for current", async () => {
    const res = await appWith().request("/thing");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-API-Version")).toBe(CURRENT_API_VERSION);
    expect(res.headers.get("Deprecation")).toBeNull();
  });

  it("adds Deprecation + Sunset + Link for a deprecated version", async () => {
    setVersions([
      { version: "v0", status: "deprecated", sunsetDate: "2999-01-01", successor: "v1" },
    ]);
    const res = await appWith().request("/thing", { headers: { "x-api-version": "v0" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Deprecation")).toBe("true");
    expect(res.headers.get("Sunset")).toBeTruthy();
    expect(res.headers.get("Link")).toContain('rel="successor-version"');
  });

  it("returns 410 for a sunset version", async () => {
    setVersions([{ version: "v0", status: "sunset" }]);
    const res = await appWith().request("/thing", { headers: { "x-api-version": "v0" } });
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("API_VERSION_SUNSET");
  });

  it("returns 410 once a deprecated version is past its sunset date", async () => {
    setVersions([{ version: "v0", status: "deprecated", sunsetDate: "2000-01-01" }]);
    const res = await appWith().request("/thing", { headers: { "x-api-version": "v0" } });
    expect(res.status).toBe(410);
  });

  it("treats an unknown version as current", async () => {
    const res = await appWith().request("/thing", { headers: { "x-api-version": "v99" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-API-Version")).toBe(CURRENT_API_VERSION);
  });
});
