import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  type OpenApiSpec,
  emitSchemaDeclaration,
  generateSdk,
  operationMethodName,
  tsTypeForSchema,
} from "../../scripts/generate-sdk";

// ── tsTypeForSchema ───────────────────────────────────────────────────────────

describe("tsTypeForSchema", () => {
  it("maps primitives", () => {
    expect(tsTypeForSchema({ type: "string" })).toBe("string");
    expect(tsTypeForSchema({ type: "integer" })).toBe("number");
    expect(tsTypeForSchema({ type: "number" })).toBe("number");
    expect(tsTypeForSchema({ type: "boolean" })).toBe("boolean");
    expect(tsTypeForSchema(undefined)).toBe("unknown");
  });

  it("resolves $ref to the bare schema name", () => {
    expect(tsTypeForSchema({ $ref: "#/components/schemas/TokenResponse" })).toBe("TokenResponse");
  });

  it("renders string enums as a union of literals", () => {
    expect(tsTypeForSchema({ type: "string", enum: ["a", "b", "c"] })).toBe('"a" | "b" | "c"');
  });

  it("renders arrays", () => {
    expect(tsTypeForSchema({ type: "array", items: { type: "string" } })).toBe("string[]");
    expect(tsTypeForSchema({ type: "array", items: { $ref: "#/components/schemas/Session" } })).toBe(
      "Session[]"
    );
  });

  it("handles nullable (type tuple with null)", () => {
    expect(tsTypeForSchema({ type: ["string", "null"] })).toBe("string | null");
  });

  it("inlines object types with required/optional props", () => {
    expect(
      tsTypeForSchema({
        type: "object",
        properties: { a: { type: "string" }, b: { type: "number" } },
        required: ["a"],
      })
    ).toBe("{ a: string; b?: number }");
  });

  it("falls back to Record for free-form objects", () => {
    expect(tsTypeForSchema({ type: "object" })).toBe("Record<string, unknown>");
  });
});

// ── operationMethodName ───────────────────────────────────────────────────────

describe("operationMethodName", () => {
  it("camelCases method + path segments", () => {
    expect(operationMethodName("post", "/auth/login")).toBe("postAuthLogin");
    expect(operationMethodName("post", "/auth/logout/all")).toBe("postAuthLogoutAll");
  });

  it("turns {param} segments into By<Param>", () => {
    expect(operationMethodName("get", "/auth/oauth/{provider}/authorize")).toBe(
      "getAuthOauthByProviderAuthorize"
    );
    expect(operationMethodName("delete", "/sessions/{id}")).toBe("deleteSessionsById");
    expect(operationMethodName("get", "/admin/users/{id}/roles/{roleName}")).toBe(
      "getAdminUsersByIdRolesByRoleName"
    );
  });
});

// ── emitSchemaDeclaration ─────────────────────────────────────────────────────

describe("emitSchemaDeclaration", () => {
  it("emits an interface for an object schema", () => {
    const decl = emitSchemaDeclaration("Widget", {
      type: "object",
      properties: { id: { type: "string" }, count: { type: "integer", description: "how many" } },
      required: ["id"],
    });
    expect(decl).toContain("export interface Widget {");
    expect(decl).toContain("id: string;");
    expect(decl).toContain("count?: number;");
    expect(decl).toContain("/** how many */");
  });

  it("emits a type alias for an enum schema", () => {
    const decl = emitSchemaDeclaration("Status", { type: "string", enum: ["on", "off"] });
    expect(decl).toBe('export type Status = "on" | "off";');
  });
});

// ── generateSdk (inline spec) ─────────────────────────────────────────────────

describe("generateSdk", () => {
  const spec: OpenApiSpec = {
    info: { title: "Demo API", version: "9.9.9" },
    servers: [{ url: "https://demo.test" }],
    components: {
      schemas: {
        Widget: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      },
    },
    paths: {
      "/widgets/{id}": {
        get: {
          summary: "Get a widget",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/Widget" } } } },
          },
        },
      },
      "/widgets": {
        post: {
          summary: "Create a widget",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
          },
          responses: {
            "201": { content: { "application/json": { schema: { $ref: "#/components/schemas/Widget" } } } },
          },
        },
      },
    },
  };

  const out = generateSdk(spec);

  it("emits the runtime, error, and client classes", () => {
    expect(out).toContain("export class ZeroAuthError extends Error");
    expect(out).toContain("export class ZeroAuthClient");
    expect(out).toContain("export interface ZeroAuthClientOptions");
  });

  it("emits schema interfaces", () => {
    expect(out).toContain("export interface Widget {");
  });

  it("emits a typed method for a path-param GET", () => {
    expect(out).toContain(
      "getWidgetsById(id: string): Promise<Widget> {"
    );
    expect(out).toContain("`/widgets/${encodeURIComponent(id)}`");
  });

  it("emits a typed method for a POST with a request body", () => {
    expect(out).toContain("postWidgets(body: { name: string }): Promise<Widget> {");
    expect(out).toContain('this.request("POST", `/widgets`, { body });');
  });

  it("bakes the default base URL from servers[0]", () => {
    expect(out).toContain('options.baseUrl ?? "https://demo.test"');
  });
});

// ── generateSdk (real OpenAPI spec) ───────────────────────────────────────────

describe("generateSdk against the real openapi.json", () => {
  const spec = JSON.parse(
    readFileSync(path.join(process.cwd(), "src", "api", "openapi.json"), "utf8")
  ) as OpenApiSpec;
  const out = generateSdk(spec);

  it("includes the well-known schema interfaces", () => {
    expect(out).toContain("export interface TokenResponse {");
    expect(out).toContain("export interface ErrorEnvelope {");
  });

  it("includes a typed login method returning TokenResponse", () => {
    expect(out).toContain("postAuthLogin(body: { email: string; password: string }): Promise<TokenResponse>");
  });

  it("generates one method per operation across all paths", () => {
    const methodCount = Object.values(spec.paths ?? {}).reduce((n, ops) => {
      return n + ["get", "post", "put", "patch", "delete"].filter((m) => (ops as Record<string, unknown>)[m]).length;
    }, 0);
    // Each generated method body calls this.request(...) exactly once.
    const requestCalls = (out.match(/return this\.request\(/g) ?? []).length;
    expect(requestCalls).toBe(methodCount);
    expect(methodCount).toBeGreaterThan(30);
  });
});
