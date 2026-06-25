#!/usr/bin/env node
// Generate a committed API reference (docs/api-reference.md) from the OpenAPI
// spec (src/api/openapi.json). Deterministic + idempotent so it can be diffed.
//
//   bun run docs:api    (or: node scripts/generate-api-docs.mjs)
//
// The live, interactive docs are Swagger UI at /docs (dev); full request/response
// types live in the generated @zerotrust/client SDK. This file is the static,
// browsable map for people reading the repo.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(readFileSync(path.join(root, "src/api/openapi.json"), "utf8"));

const METHOD_ORDER = ["get", "post", "put", "patch", "delete", "options", "head"];
const rootSecured = Array.isArray(spec.security) && spec.security.length > 0;

/** Collect operations grouped by their first tag. */
const groups = new Map();
let opCount = 0;
for (const [route, item] of Object.entries(spec.paths ?? {})) {
  for (const method of METHOD_ORDER) {
    const op = item[method];
    if (!op) continue;
    opCount++;
    const tag = (Array.isArray(op.tags) && op.tags[0]) || "Other";
    const secured = op.security !== undefined ? op.security.length > 0 : rootSecured;
    const summary = (op.summary || op.description || "").split("\n")[0].trim();
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag).push({ method: method.toUpperCase(), route, summary, secured });
  }
}

const tags = [...groups.keys()].sort((a, b) => a.localeCompare(b));
const lines = [];
lines.push(`# ${spec.info?.title ?? "API"} reference`);
lines.push("");
lines.push(
  `_Generated from \`src/api/openapi.json\` (${spec.info?.title ?? "API"} v${spec.info?.version ?? "?"}) — run \`bun run docs:api\` to refresh; do not edit by hand._`
);
lines.push("");
lines.push(
  "Live, interactive docs: **Swagger UI at `/docs`** (dev). Full request/response " +
    "types: the generated **`@zerotrust/client`** SDK (`packages/client`). 🔒 = requires authentication."
);
lines.push("");
lines.push(`**${opCount} operations** across ${tags.length} groups.`);
lines.push("");
lines.push(
  "> **Coverage note:** this lists the operations currently described in " +
    "`openapi.json` (auth/admin/MFA/sessions/OAuth + organizations). Several " +
    "mounted route modules — billing, wallet, search, collaboration, compliance, " +
    "etc. — are not yet in the spec; see the [README API overview](../README.md#api-overview) " +
    "and `src/api/server.ts` for the full mounted surface. Expanding `openapi.json` " +
    "to the whole API (so the SDK + this reference cover it) is tracked as an " +
    "Integration-Completion (D5) follow-up."
);
lines.push("");
lines.push("## Contents");
lines.push("");
for (const tag of tags) {
  const anchor = tag.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  lines.push(`- [${tag}](#${anchor}) (${groups.get(tag).length})`);
}
lines.push("");

for (const tag of tags) {
  lines.push(`## ${tag}`);
  lines.push("");
  lines.push("| Method | Path | Summary | Auth |");
  lines.push("| --- | --- | --- | --- |");
  const rows = groups
    .get(tag)
    .slice()
    .sort(
      (a, b) =>
        a.route.localeCompare(b.route) ||
        METHOD_ORDER.indexOf(a.method.toLowerCase()) - METHOD_ORDER.indexOf(b.method.toLowerCase())
    );
  for (const r of rows) {
    lines.push(`| ${r.method} | \`${r.route}\` | ${r.summary || "—"} | ${r.secured ? "🔒" : ""} |`);
  }
  lines.push("");
}

writeFileSync(path.join(root, "docs/api-reference.md"), `${lines.join("\n")}\n`);
console.log(`✓ Generated docs/api-reference.md (${opCount} operations, ${tags.length} groups)`);
