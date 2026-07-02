#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = process.cwd();
const SERVER = join(ROOT, "src/api/server.ts");
const OUT = join(ROOT, "docs/api-ui-integration-matrix.md");

// Product-surface decisions for routes that intentionally remain API/SDK-only.
// Excluding them keeps the unmatched list actionable for future dashboard gaps.
const PRODUCT_SURFACE_DISPOSITIONS = [
  ["GET", "/admin/feedback", "Operator API-only: feedback can be exported/triaged through the admin API without a dashboard inbox."],
  ["GET", "/admin/roles", "Operator API-only: system role inventory and seed validation remain privileged admin API workflows."],
  ["POST", "/admin/roles", "Operator API-only: system role CRUD remains a privileged admin API workflow."],
  ["GET", "/admin/jit-grants", "Operator API-only: emergency JIT grant moderation is scriptable for approval runbooks."],
  ["DELETE", "/admin/jit-grants/{id}", "Operator API-only: emergency JIT grant moderation is scriptable for approval runbooks."],
  ["POST", "/admin/jit-grants/{id}/approve", "Operator API-only: emergency JIT grant moderation is scriptable for approval runbooks."],
  ["POST", "/admin/jit-grants/{id}/deny", "Operator API-only: emergency JIT grant moderation is scriptable for approval runbooks."],
  ["GET", "/billing/tax-exemptions", "Billing ops API-only: tax exemption review is a back-office/SDK workflow."],
  ["POST", "/billing/tax-exemptions", "Billing ops API-only: tax exemption review is a back-office/SDK workflow."],
  ["POST", "/billing/tax-exemptions/{id}/status", "Billing ops API-only: tax exemption review is a back-office/SDK workflow."],
  ["GET", "/billing/vat/validate", "Billing ops API-only: VAT validation is for checkout/SDK integrations."],
  ["GET", "/billing/usage", "Billing ops API-only: usage is consumed by billing integrations; dashboard billing surfaces subscription status."],
  ["POST", "/billing/change-plan", "Billing ops API-only: plan changes remain server/API initiated to avoid duplicate checkout surfaces."],
  ["GET", "/admin/attachments", "Operator API-only: admin attachment listing supports support/export tooling."],
  ["POST", "/admin/attachments/upload", "Operator API-only: admin attachment upload supports support/export tooling."],
  ["POST", "/admin/lifecycle-emails", "Operator API-only: lifecycle email sends are runbook-controlled content operations."],
  ["GET", "/admin/webhooks/{webhookId}/deliveries", "Operator API-only: admin-wide delivery-log inspection complements the user webhook page."],
  ["POST", "/search/index", "Operator API-only: search index management is a maintenance/runbook action."],
  ["DELETE", "/search/index/{type}/{id}", "Operator API-only: search index management is a maintenance/runbook action."],
  ["GET", "/search/provider", "Operator API-only: search provider introspection is for health/debug tooling."],
  ["GET", "/regions/orgs/{orgId}/branding", "Admin API-only: regional branding metadata is available to tenant tooling; regions UI covers health and pinning."],
  ["PUT", "/regions/orgs/{orgId}/branding", "Admin API-only: regional branding metadata is available to tenant tooling; regions UI covers health and pinning."],
  ["PUT", "/regions/orgs/{orgId}/domain", "Admin API-only: regional domain metadata is available to tenant tooling; regions UI covers health and pinning."],
  ["GET", "/auth/unsubscribe", "Public API-only landing endpoint reached from email links, not dashboard navigation."],
  ["POST", "/wallet/spend", "SDK-only: programmatic spend is for metered product integrations, not dashboard clicks."],
].map(([method, path, decision]) => ({ method, path, decision }));
const PRODUCT_SURFACE_DISPOSITION_KEYS = new Set(
  PRODUCT_SURFACE_DISPOSITIONS.map((route) => `${route.method} ${route.path}`)
);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", "dist", "coverage", "playwright-report"].includes(entry))
      continue;
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, files);
    else if (/\.(ts|tsx)$/.test(path)) files.push(path);
  }
  return files;
}

function normalizePath(path) {
  return (
    path
      .split("?")[0]
      .replace(/\/+/g, "/")
      .replace(/\/:([A-Za-z0-9_]+)/g, "/{$1}")
      .replace(/\/$/, "") || "/"
  );
}

function relativePath(path) {
  return relative(ROOT, path).replaceAll("\\", "/");
}

function routeFromRawPath(rawPath) {
  const staticPrefix = rawPath.split("${")[0];
  const queryIndex = staticPrefix.indexOf("?");
  const routePath = queryIndex === -1 ? staticPrefix : staticPrefix.slice(0, queryIndex);
  return routePath.startsWith("/") ? normalizePath(routePath) : null;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function joinRoute(prefix, routePath) {
  const full = `${prefix === "/" ? "" : prefix}${routePath === "/" ? "" : routePath}`;
  return normalizePath(full || "/");
}

function parseServerMounts() {
  const server = readFileSync(SERVER, "utf8");
  const imports = new Map();
  const importRe = /import\s+([A-Za-z0-9_]+)\s+from\s+"([^"]+)";/g;
  for (const match of server.matchAll(importRe)) imports.set(match[1], match[2]);

  const mounts = [];
  const mountRe = /app\.route\("([^"]+)",\s*([A-Za-z0-9_]+)\)/g;
  for (const match of server.matchAll(mountRe)) {
    const [, prefix, symbol] = match;
    const importPath = imports.get(symbol);
    if (!importPath) continue;
    let file = join(dirname(SERVER), `${importPath}.ts`);
    if (!statExists(file)) file = join(dirname(SERVER), importPath, "index.ts");
    mounts.push({ prefix: normalizePath(prefix), symbol, file });
  }
  return mounts;
}

function statExists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
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
    for (const match of source.matchAll(routeRe)) {
      routes.push({
        method: match[1].toUpperCase(),
        path: joinRoute(mount.prefix, match[2]),
        file: relativePath(mount.file),
      });
    }
  }
  // Include directly mounted server routes such as /api/versions and /admin/slo.
  const server = readFileSync(SERVER, "utf8");
  const directRe = /app\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
  for (const match of server.matchAll(directRe)) {
    routes.push({
      method: match[1].toUpperCase(),
      path: normalizePath(match[2]),
      file: "src/api/server.ts",
    });
  }
  return dedupe(routes);
}

function parseFrontendCalls() {
  const calls = [];
  const files = walk(join(ROOT, "packages/ui/src")).filter(
    (file) => !/[\\/.](test|spec)\.(ts|tsx)$/.test(file)
  );
  const apiRe = /api\.(get|post|put|patch|delete)(?:<[^>]*>)?\(\s*([`"'])([^`"']+)\2/g;
  const apiClientRe =
    /\b(apiGetBlob|apiGet|apiPostFormData|apiPost|apiPut|apiPatch|apiDelete)(?:<[^>]*>)?\(\s*([`"'])([^`"']+)\2/g;
  const hookRe = /\buse(Paginated)?Api(?:<[^>]*>)?\(\s*([`"'])([\s\S]*?)\2/g;
  const apiClientMethods = {
    apiGet: "GET",
    apiGetBlob: "GET",
    apiPost: "POST",
    apiPostFormData: "POST",
    apiPut: "PUT",
    apiPatch: "PATCH",
    apiDelete: "DELETE",
  };
  const fetchRe = /fetch\(\s*`?\$?\{?BASE_URL\}?([^`"'$]+)[`"']/g;
  for (const file of files) {
    const source = stripComments(readFileSync(file, "utf8"));
    for (const match of source.matchAll(apiRe)) {
      const routePath = routeFromRawPath(match[3]);
      if (!routePath) continue;
      calls.push({
        method: match[1].toUpperCase(),
        path: routePath,
        file: relativePath(file),
      });
    }
    for (const match of source.matchAll(apiClientRe)) {
      const routePath = routeFromRawPath(match[3]);
      if (!routePath) continue;
      calls.push({ method: apiClientMethods[match[1]], path: routePath, file: relativePath(file) });
    }
    for (const match of source.matchAll(hookRe)) {
      const routePath = routeFromRawPath(match[3]);
      if (!routePath) continue;
      calls.push({ method: "GET", path: routePath, file: relativePath(file) });
    }
    for (const match of source.matchAll(fetchRe)) {
      calls.push({ method: "FETCH", path: normalizePath(match[1]), file: relativePath(file) });
    }
  }
  return dedupe(calls);
}

function dedupe(items) {
  const seen = new Set();
  return items
    .filter((item) => {
      const key = `${item.method} ${item.path} ${item.file}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
}

function prefixMatch(frontendPath, backendPath) {
  if (frontendPath === backendPath) return true;
  const backendStaticPrefix = backendPath.replace(/\/\{[^/]+\}.*/, "");
  if (backendStaticPrefix && frontendPath === backendStaticPrefix) return true;
  const frontendRoot = frontendPath.split("/").slice(0, 3).join("/");
  const backendRoot = backendPath.split("/").slice(0, 3).join("/");
  return frontendRoot && frontendRoot === backendRoot;
}

const backend = parseBackendRoutes();
const frontend = parseFrontendCalls();
const backendByMethodPath = new Set(backend.map((r) => `${r.method} ${r.path}`));
const uncoveredFrontend = frontend.filter((call) => {
  if (call.method === "FETCH") return !backend.some((route) => prefixMatch(call.path, route.path));
  return (
    !backendByMethodPath.has(`${call.method} ${call.path}`) &&
    !backend.some((route) => route.method === call.method && prefixMatch(call.path, route.path))
  );
});
const unreferencedBackend = backend.filter(
  (route) =>
    !PRODUCT_SURFACE_DISPOSITION_KEYS.has(`${route.method} ${route.path}`) &&
    !frontend.some((call) => prefixMatch(call.path, route.path))
);

function rows(items, columns) {
  if (items.length === 0) return "| _None_ | | |\n";
  return (
    items.map((item) => `| ${columns.map((col) => item[col] ?? "").join(" | ")} |`).join("\n") +
    "\n"
  );
}

const markdown = `# API ↔ UI Integration Matrix

Generated by \`node scripts/audit-api-ui-map.mjs\`.

## Summary

| Metric | Count |
|---|---:|
| Backend routes discovered | ${backend.length} |
| Frontend API calls discovered | ${frontend.length} |
| Frontend calls without exact/prefix backend match | ${uncoveredFrontend.length} |
| Backend routes not referenced by UI scan | ${unreferencedBackend.length} |
| Product-surface decisions excluded from unmatched list | ${PRODUCT_SURFACE_DISPOSITIONS.length} |

> This scanner is intentionally conservative: dynamic template-string paths are not treated as exact matches unless their static prefix maps to a backend route. Review the unmatched lists before opening implementation tickets.

## Frontend calls without backend match

| Method | Path | File |
|---|---|---|
${rows(uncoveredFrontend, ["method", "path", "file"])}
## Product-surface decisions excluded from unmatched list

These backend routes intentionally remain API/SDK-only for now. They are documented
here instead of appearing as dashboard gaps.

| Method | Path | Decision |
|---|---|---|
${rows(PRODUCT_SURFACE_DISPOSITIONS, ["method", "path", "decision"])}
## Backend routes not referenced by UI scan

| Method | Path | File |
|---|---|---|
${rows(unreferencedBackend, ["method", "path", "file"])}
## All frontend calls

| Method | Path | File |
|---|---|---|
${rows(frontend, ["method", "path", "file"])}
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, markdown);
console.log(
  `Wrote ${relativePath(OUT)} (${backend.length} backend routes, ${frontend.length} frontend calls).`
);
