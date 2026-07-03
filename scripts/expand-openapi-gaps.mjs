#!/usr/bin/env node
/**
 * Add minimal OpenAPI path stubs for backend routes missing from openapi.json.
 * Run: node scripts/expand-openapi-gaps.mjs
 * Then: bun run verify:generated
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = process.cwd();
const OPENAPI_PATH = join(ROOT, "src/api/openapi.json");
const SERVER = join(ROOT, "src/api/server.ts");

const PUBLIC_PATHS = new Set([
  "GET /.well-known/security.txt",
  "GET /security.txt",
  "GET /health",
  "GET /status",
  "GET /status/stream",
  "GET /api/versions",
  "GET /protected",
  "GET /auth/magic-link/verify",
  "GET /auth/pow/challenge",
  "POST /auth/login/mfa",
  "POST /auth/magic-link/send",
  "POST /auth/magic-link/verify",
  "POST /auth/passkey/authenticate/verify",
  "POST /auth/passkey/register/verify",
  "POST /auth/verify-email",
  "POST /auth/verify-email/resend",
  "POST /billing/webhook",
  "POST /webhooks/email/event",
  "POST /ssf/events",
]);

const METRICS_TOKEN_PATHS = new Set(["GET /metrics"]);

function normalizePath(path) {
  return (
    path
      .split("?")[0]
      .replace(/\/+/g, "/")
      .replace(/\/:([A-Za-z0-9_]+)/g, "/{$1}")
      .replace(/\/$/, "") || "/"
  );
}

function joinRoute(prefix, routePath) {
  const full = `${prefix === "/" ? "" : prefix}${routePath === "/" ? "" : routePath}`;
  return normalizePath(full || "/");
}

function statExists(path) {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

function parseServerMounts() {
  const server = readFileSync(SERVER, "utf8");
  const imports = new Map();
  for (const m of server.matchAll(/import\s+([A-Za-z0-9_]+)\s+from\s+"([^"]+)";/g)) {
    imports.set(m[1], m[2]);
  }
  const mounts = [];
  for (const m of server.matchAll(/app\.route\("([^"]+)",\s*([A-Za-z0-9_]+)\)/g)) {
    const [, prefix, symbol] = m;
    const importPath = imports.get(symbol);
    if (!importPath) continue;
    let file = join(dirname(SERVER), `${importPath}.ts`);
    if (!statExists(file)) file = join(dirname(SERVER), importPath, "index.ts");
    mounts.push({ prefix: normalizePath(prefix), file });
  }
  return mounts;
}

function parseBackendRoutes() {
  const routes = [];
  const methods = ["get", "post", "put", "patch", "delete"];
  for (const mount of parseServerMounts()) {
    if (!statExists(mount.file)) continue;
    const source = readFileSync(mount.file, "utf8");
    const routeRe = new RegExp(
      `(?:router|app)\\.(${methods.join("|")})\\(\\s*["']([^"']+)["']`,
      "g"
    );
    for (const m of source.matchAll(routeRe)) {
      routes.push({
        method: m[1].toLowerCase(),
        path: joinRoute(mount.prefix, m[2]),
        file: relative(ROOT, mount.file).replaceAll("\\", "/"),
      });
    }
  }
  const server = readFileSync(SERVER, "utf8");
  for (const m of server.matchAll(/app\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g)) {
    routes.push({
      method: m[1].toLowerCase(),
      path: normalizePath(m[2]),
      file: "src/api/server.ts",
    });
  }
  const seen = new Set();
  return routes.filter((r) => {
    const k = `${r.method} ${r.path}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function inferTag(path) {
  if (path.startsWith("/admin/notifications")) return "Notifications";
  if (path.startsWith("/admin/")) return "Admin";
  if (path.startsWith("/auth/passkey")) return "Passkeys";
  if (
    path.startsWith("/auth/mfa") ||
    path === "/auth/login/mfa" ||
    path.startsWith("/auth/verify/")
  ) {
    return "MFA";
  }
  if (path.startsWith("/auth/")) return "Auth";
  if (path.startsWith("/jit/")) return "Organizations";
  if (path.startsWith("/webhooks")) return "Webhooks";
  if (path.startsWith("/billing/")) return "Billing";
  if (
    path === "/health" ||
    path === "/metrics" ||
    path === "/status" ||
    path.startsWith("/status/") ||
    path.includes("security.txt") ||
    path === "/api/versions" ||
    path === "/protected" ||
    path === "/admin/slo"
  ) {
    return "Health";
  }
  return "Admin";
}

function humanize(path, method) {
  const action = { get: "Get", post: "Create", put: "Update", patch: "Update", delete: "Delete" }[
    method
  ];
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1]?.replace(/[{}]/g, "") ?? "resource";
  return `${action} ${last} (${path})`;
}

function pathParameters(path) {
  const params = [];
  for (const m of path.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    params.push({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    });
  }
  return params;
}

function buildOperation(route) {
  const { method, path } = route;
  const tag = inferTag(path);
  const op = {
    tags: [tag],
    summary: humanize(path, method),
    parameters: pathParameters(path),
    responses: {
      200: { description: "Success" },
      400: {
        description: "Bad request",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorEnvelope" },
          },
        },
      },
    },
  };

  const key = `${method.toUpperCase()} ${path}`;
  if (!PUBLIC_PATHS.has(key) && !METRICS_TOKEN_PATHS.has(key)) {
    op.security = [{ BearerAuth: [] }];
  }

  if (METRICS_TOKEN_PATHS.has(key)) {
    op.parameters.push({
      name: "Authorization",
      in: "header",
      required: true,
      schema: { type: "string" },
      description: "Bearer METRICS_AUTH_TOKEN",
    });
  }

  if (["post", "put", "patch"].includes(method)) {
    op.requestBody = {
      content: {
        "application/json": {
          schema: { type: "object", additionalProperties: true },
        },
      },
    };
  }

  if (path === "/billing/webhook") {
    op.summary = "Stripe billing webhook (signature-verified)";
    delete op.security;
    op.parameters.push({
      name: "stripe-signature",
      in: "header",
      required: true,
      schema: { type: "string" },
    });
  }

  if (path === "/webhooks/email/event") {
    op.summary = "Inbound email provider event webhook";
    delete op.security;
  }

  return op;
}

const spec = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
const paths = spec.paths ?? {};
const routes = parseBackendRoutes();

let added = 0;
for (const route of routes) {
  if (!paths[route.path]) paths[route.path] = {};
  if (paths[route.path][route.method]) continue;
  paths[route.path][route.method] = buildOperation(route);
  added++;
}

// Ensure Webhooks tag exists
const tagNames = new Set((spec.tags ?? []).map((t) => t.name));
if (!tagNames.has("Webhooks")) {
  spec.tags = [
    ...(spec.tags ?? []),
    {
      name: "Webhooks",
      description:
        "Outbound webhook endpoint registration, delivery history, and provider event receivers.",
    },
  ];
}

// Sort paths alphabetically for stable diffs
spec.paths = Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b)));

writeFileSync(OPENAPI_PATH, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`Added ${added} operations to openapi.json`);
