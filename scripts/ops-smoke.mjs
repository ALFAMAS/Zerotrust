#!/usr/bin/env node
const baseUrl = (process.env.API_URL || process.env.BASE_URL || "http://localhost:1337").replace(
  /\/$/,
  ""
);
const uiUrl = (process.env.UI_URL || process.env.STAGING_URL || "").replace(/\/$/, "");
const metricsToken = process.env.METRICS_AUTH_TOKEN?.trim() || "";

const checks = [
  {
    name: "health",
    path: "/health",
    expect: (res, body) => res.ok && body.length > 0 && Boolean(res.headers.get("x-trace-id")),
  },
  {
    name: "metrics",
    path: "/metrics",
    expect: (res, body) => res.ok && body.includes("http"),
    verifyAuth: Boolean(metricsToken),
  },
  {
    name: "versions",
    path: "/api/versions",
    expect: (res, body) => res.ok && body.includes("current"),
  },
];

const fetchOpts = (headers = {}) => ({
  headers: { Accept: "text/plain, application/json", ...headers },
  signal: AbortSignal.timeout(5000),
  redirect: "error",
});

let failed = 0;
for (const check of checks) {
  const url = `${baseUrl}${check.path}`;
  try {
    if (check.verifyAuth) {
      const unauthRes = await fetch(url, fetchOpts());
      if (unauthRes.status !== 401) {
        failed++;
        console.error(
          `FAIL ${check.name}: expected HTTP 401 without Bearer token, got ${unauthRes.status} from ${url}`
        );
        continue;
      }
      console.log(`PASS ${check.name}: unauthenticated scrape rejected (401)`);
    }

    const headers = check.verifyAuth ? { Authorization: `Bearer ${metricsToken}` } : {};
    const res = await fetch(url, fetchOpts(headers));
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

if (uiUrl && baseUrl) {
  const configUrl = `${uiUrl}/api/deploy-config`;
  try {
    const res = await fetch(configUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    const body = await res.text();
    if (!res.ok) {
      failed++;
      console.error(`FAIL ui-api-url: HTTP ${res.status} from ${configUrl}`);
    } else {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        failed++;
        console.error(`FAIL ui-api-url: invalid JSON from ${configUrl}`);
        parsed = null;
      }
      const bakedApiUrl = (parsed?.apiUrl ?? "").replace(/\/$/, "");
      if (parsed && bakedApiUrl !== baseUrl) {
        failed++;
        console.error(
          `FAIL ui-api-url: UI baked apiUrl ${bakedApiUrl || "(empty)"} !== expected API_URL ${baseUrl}`
        );
      } else if (parsed) {
        console.log(`PASS ui-api-url: UI points at ${bakedApiUrl}`);
      }
    }
  } catch (err) {
    failed++;
    console.error(`FAIL ui-api-url: ${configUrl} ${err?.message || err}`);
  }
}

if (failed > 0) process.exit(1);
