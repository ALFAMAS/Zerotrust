#!/usr/bin/env node
/**
 * Verify Prometheus → Alertmanager wiring (OBS-1).
 * Run after `docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d`.
 *
 * Env:
 *   PROMETHEUS_URL   — default http://localhost:9090
 *   ALERTMANAGER_URL — default http://localhost:9093
 *   VERIFY_ALERTING_SEND_TEST — when "true", POST a synthetic alert to Alertmanager
 */
const prometheusUrl = (process.env.PROMETHEUS_URL || "http://localhost:9090").replace(
  /\/$/,
  ""
);
const alertmanagerUrl = (process.env.ALERTMANAGER_URL || "http://localhost:9093").replace(
  /\/$/,
  ""
);
const sendTest = process.env.VERIFY_ALERTING_SEND_TEST === "true";

const fetchOpts = (init = {}) => ({
  ...init,
  signal: AbortSignal.timeout(8000),
  redirect: "error",
});

let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}: ${err?.message || err}`);
  }
}

await check("alertmanager-health", async () => {
  const res = await fetch(`${alertmanagerUrl}/-/healthy`, fetchOpts());
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${alertmanagerUrl}/-/healthy`);
  const body = await res.text();
  if (!body.includes("OK")) throw new Error(`unexpected body: ${body.slice(0, 80)}`);
});

await check("prometheus-rules", async () => {
  const res = await fetch(`${prometheusUrl}/api/v1/rules`, fetchOpts());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const groups = json?.data?.groups ?? [];
  const slo = groups.find((g) => g.name === "zerotrust-slo");
  if (!slo) throw new Error("zerotrust-slo rule group not loaded");
  const names = slo.rules.map((r) => r.name);
  for (const expected of [
    "ZerotrustHighErrorRate",
    "ZerotrustLatencyP95High",
    "ZerotrustMetricsMissing",
  ]) {
    if (!names.includes(expected)) throw new Error(`missing alert rule ${expected}`);
  }
});

await check("prometheus-alertmanagers", async () => {
  const res = await fetch(`${prometheusUrl}/api/v1/alertmanagers`, fetchOpts());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const active = json?.data?.activeAlertmanagers ?? [];
  if (active.length === 0) {
    throw new Error("no active Alertmanager targets — check prometheus.yml alerting block");
  }
});

if (sendTest) {
  await check("alertmanager-test-alert", async () => {
    const payload = [
      {
        labels: {
          alertname: "ZerotrustObs1Verification",
          severity: "warning",
          service: "zerotrust-api",
        },
        annotations: {
          summary: "OBS-1 verification synthetic alert",
          description: "Safe to ignore — emitted by scripts/verify-alerting.mjs",
        },
        startsAt: new Date().toISOString(),
      },
    ];
    const res = await fetch(`${alertmanagerUrl}/api/v2/alerts`, {
      ...fetchOpts({ method: "POST", headers: { "Content-Type": "application/json" } }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} posting test alert`);
  });
}

if (failed > 0) process.exit(1);
