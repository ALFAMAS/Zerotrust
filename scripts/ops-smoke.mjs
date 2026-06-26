#!/usr/bin/env node
const baseUrl = (process.env.API_URL || process.env.BASE_URL || "http://localhost:1337").replace(
  /\/$/,
  ""
);
const checks = [
  {
    name: "health",
    path: "/health",
    expect: (res, body) => res.ok && body.length > 0 && Boolean(res.headers.get("x-trace-id")),
  },
  { name: "metrics", path: "/metrics", expect: (res, body) => res.ok && body.includes("http") },
  {
    name: "versions",
    path: "/api/versions",
    expect: (res, body) => res.ok && body.includes("current"),
  },
];

let failed = 0;
for (const check of checks) {
  const url = `${baseUrl}${check.path}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/plain, application/json" },
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    const body = await res.text();
    if (!check.expect(res, body)) {
      failed++;
      console.error(`FAIL ${check.name}: HTTP ${res.status} from ${url}`);
      continue;
    }
    console.log(`PASS ${check.name}: HTTP ${res.status} ${url}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${check.name}: ${url} ${err?.message || err}`);
  }
}

if (failed > 0) process.exit(1);
