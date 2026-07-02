#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = process.cwd();
const SERVER = join(ROOT, "src/api/server.ts");
const OUT = join(ROOT, "docs/api-ui-integration-matrix.md");

// Product-surface decisions for routes that intentionally remain API/SDK-only.
// Excluding them keeps the unmatched list actionable for future dashboard gaps.
const PRODUCT_SURFACE_DISPOSITIONS = [
  [
    "GET",
    "/auth/unsubscribe",
    "Public API-only landing endpoint reached from email links, not dashboard navigation.",
  ],
  [
    "POST",
    "/wallet/spend",
    "SDK-only: programmatic spend is for metered product integrations, not dashboard clicks.",
  ],
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

function extractPathLiterals(fragment) {
  const paths = new Set();
  for (const match of fragment.matchAll(/["'`](\/[^"'`${}]+)["'`]/g)) {
    paths.add(normalizePath(match[1].split("?")[0]));
  }
  for (const match of fragment.matchAll(/`(\/[^`$]+)/g)) {
    paths.add(normalizePath(match[1].split("?")[0]));
  }
  return paths;
}

const API_CLIENT_METHODS = {
  apiGet: "GET",
  apiGetBlob: "GET",
  apiPost: "POST",
  apiPostFormData: "POST",
  apiPostRaw: "POST",
  apiPut: "PUT",
  apiPatch: "PATCH",
  apiDelete: "DELETE",
  serverApiGet: "GET",
};

function inferMethodsForIdentifier(source, identifier) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const methods = new Set();
  let idx = 0;
  while (true) {
    const at = source.indexOf(identifier, idx);
    if (at === -1) break;
    const callWindow = source.slice(Math.max(0, at - 160), at + identifier.length + 80);
    for (const [fn, method] of Object.entries(API_CLIENT_METHODS)) {
      const re = new RegExp(`\\b${fn}\\b[^(]*\\([\\s\\S]*?\\b${escaped}\\b`);
      if (re.test(callWindow)) methods.add(method);
    }
    idx = at + identifier.length;
  }
  return methods.size > 0 ? [...methods] : ["GET"];
}

function inferMethodForPath(source, pathOrRef) {
  const escaped = pathOrRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [fn, method] of Object.entries(API_CLIENT_METHODS)) {
    const re = new RegExp(`\\b${fn}\\b[^(]*\\([^;\\n]*["'\`]${escaped}`);
    if (re.test(source)) return method;
  }
  return inferMethodsForIdentifier(source, pathOrRef)[0];
}

function parseServerStatePaths() {
  const serverStateDir = join(ROOT, "packages/ui/src/lib/server-state");
  if (!statExists(serverStateDir)) return [];

  const calls = [];
  const files = walk(serverStateDir).filter((file) => !/[\\/.](test|spec)\.(ts|tsx)$/.test(file));

  for (const file of files) {
    const source = stripComments(readFileSync(file, "utf8"));
    const relFile = relativePath(file);
    const pathConsts = new Map();
    const buildFns = new Map();

    for (const match of source.matchAll(/export const (\w+_PATH)\s*=\s*["'`]([^"'`?]+)/g)) {
      pathConsts.set(match[1], normalizePath(match[2]));
    }

    for (const match of source.matchAll(
      /export function (build\w+Path)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g
    )) {
      buildFns.set(match[1], extractPathLiterals(match[2]));
    }

    const seen = new Set();
    const record = (method, path) => {
      const key = `${method} ${path}`;
      if (seen.has(key)) return;
      seen.add(key);
      calls.push({ method, path, file: relFile });
    };

    for (const [name, path] of pathConsts) {
      for (const method of inferMethodsForIdentifier(source, name)) {
        record(method, path);
      }
    }

    for (const [fnName, paths] of buildFns) {
      for (const path of paths) {
        for (const method of inferMethodsForIdentifier(source, fnName)) {
          record(method, path);
        }
      }
    }

    for (const match of source.matchAll(
      /\b(apiGetBlob|apiGet|apiPostFormData|apiPost|apiPut|apiPatch|apiDelete|serverApiGet)(?:<[^>]*>)?\(\s*([`"'])([^`"']+)\2/g
    )) {
      const routePath = routeFromRawPath(match[3]);
      if (!routePath) continue;
      record(API_CLIENT_METHODS[match[1]], routePath);
    }

    for (const match of source.matchAll(
      /\b(apiGetBlob|apiGet|apiPostFormData|apiPost|apiPut|apiPatch|apiDelete|serverApiGet)(?:<[^>]*>)?\(\s*(\w+_PATH)\b/g
    )) {
      const path = pathConsts.get(match[2]);
      if (!path) continue;
      record(API_CLIENT_METHODS[match[1]], path);
    }

    for (const match of source.matchAll(
      /\b(apiGetBlob|apiGet|apiPostFormData|apiPost|apiPut|apiPatch|apiDelete)\b[^(]*\(\s*(build\w+Path)\s*\(/g
    )) {
      const paths = buildFns.get(match[2]);
      if (!paths) continue;
      for (const path of paths) {
        record(API_CLIENT_METHODS[match[1]], path);
      }
    }
  }

  return calls;
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
  calls.push(...parseServerStatePaths());
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
