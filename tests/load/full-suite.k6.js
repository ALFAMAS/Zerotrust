/**
 * Full load test suite — exercises all major API endpoints under realistic load.
 *
 * Scenarios:
 *   1. login_storm       — ramping login attempts (read-heavy + write)
 *   2. session_refresh   — constant token refresh rate (read-heavy)
 *   3. mixed_read        — hot GET /health and /metrics reads
 *   4. status_read       — low-rate dependency aggregation via GET /status
 *
 * Run with:
 *   k6 run tests/load/full-suite.k6.js -e BASE_URL=http://localhost:1337
 *
 * Profiles (K6_PROFILE):
 *   default — production/staging SLO: API p95 under 100ms for hot auth paths.
 *   ci      — lighter load + runner-specific budgets (overall p95<2500ms).
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const IS_CI = __ENV.K6_PROFILE === "ci";

// Custom metrics
const loginErrorRate = new Rate("login_error_rate");
const refreshErrorRate = new Rate("refresh_error_rate");
const readErrorRate = new Rate("read_error_rate");
const statusErrorRate = new Rate("status_error_rate");
const loginDuration = new Trend("login_duration_ms", true);
const refreshDuration = new Trend("refresh_duration_ms", true);
const readDuration = new Trend("read_duration_ms", true);
const statusDuration = new Trend("status_duration_ms", true);
const totalRequests = new Counter("total_requests");

export const options = {
  scenarios: IS_CI
    ? {
        login_storm: {
          executor: "ramping-vus",
          startVUs: 0,
          stages: [
            { duration: "10s", target: 10 },
            { duration: "20s", target: 20 },
            { duration: "10s", target: 0 },
          ],
          exec: "loginScenario",
        },
        session_refresh: {
          executor: "constant-arrival-rate",
          rate: 10,
          timeUnit: "1s",
          duration: "30s",
          preAllocatedVUs: 10,
          maxVUs: 30,
          startTime: "5s",
          exec: "refreshScenario",
        },
        mixed_read: {
          executor: "constant-arrival-rate",
          rate: 20,
          timeUnit: "1s",
          duration: "30s",
          preAllocatedVUs: 10,
          maxVUs: 20,
          startTime: "0s",
          exec: "readScenario",
        },
        status_read: {
          executor: "constant-arrival-rate",
          rate: 1,
          timeUnit: "5s",
          duration: "30s",
          preAllocatedVUs: 2,
          maxVUs: 5,
          startTime: "0s",
          exec: "statusScenario",
        },
      }
    : {
        login_storm: {
          executor: "ramping-vus",
          startVUs: 0,
          stages: [
            { duration: "30s", target: 50 },
            { duration: "60s", target: 200 },
            { duration: "30s", target: 0 },
          ],
          exec: "loginScenario",
        },
        session_refresh: {
          executor: "constant-arrival-rate",
          rate: 100,
          timeUnit: "1s",
          duration: "90s",
          preAllocatedVUs: 50,
          maxVUs: 150,
          startTime: "10s",
          exec: "refreshScenario",
        },
        mixed_read: {
          executor: "constant-arrival-rate",
          rate: 200,
          timeUnit: "1s",
          duration: "90s",
          preAllocatedVUs: 30,
          maxVUs: 100,
          startTime: "5s",
          exec: "readScenario",
        },
        status_read: {
          executor: "constant-arrival-rate",
          rate: 1,
          timeUnit: "1s",
          duration: "90s",
          preAllocatedVUs: 10,
          maxVUs: 30,
          startTime: "5s",
          exec: "statusScenario",
        },
      },
  thresholds: IS_CI
    ? {
        // Argon2id logins are CPU-bound: measured p95 ≈ 1.2–1.3s at these VU
        // counts on 2-core GitHub runners. These floors catch gross
        // regressions (timeouts, error storms); the strict p95<100ms SLO is
        // enforced against staging via staging-validation.yml.
        http_req_duration: ["p(95)<2500", "p(99)<4000"],
        login_duration_ms: ["p(95)<3000"],
        refresh_duration_ms: ["p(95)<1500"],
        read_duration_ms: ["p(95)<1000"],
        status_duration_ms: ["p(95)<5000"],
        login_error_rate: ["rate<0.05"],
        refresh_error_rate: ["rate<0.02"],
        read_error_rate: ["rate<0.01"],
        status_error_rate: ["rate<0.01"],
        http_req_failed: ["rate<0.01"],
        dropped_iterations: ["count<50"],
      }
    : {
        http_req_duration: ["p(95)<100", "p(99)<300"],
        login_duration_ms: ["p(95)<100"],
        refresh_duration_ms: ["p(95)<100"],
        read_duration_ms: ["p(95)<100"],
        status_duration_ms: ["p(95)<5000"],
        login_error_rate: ["rate<0.05"],
        refresh_error_rate: ["rate<0.02"],
        read_error_rate: ["rate<0.01"],
        status_error_rate: ["rate<0.01"],
        http_req_failed: ["rate<0.01"],
        dropped_iterations: ["count<50"],
      },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:1337";

// Production returns the refresh token only as a Secure __Host- cookie
// (ADR 008 / SEC-9). The plain-HTTP CI job explicitly enables a test-only
// response-body transport; cookie/header fallbacks retain staging support.
let warnedNoRefreshCookie = false;
function extractRefreshToken(res) {
  const fromMap = res.cookies && res.cookies["__Host-za_refresh_token"];
  if (fromMap && fromMap.length > 0 && fromMap[0].value) return fromMap[0].value;
  try {
    const body = JSON.parse(res.body);
    if (body.refreshToken) return body.refreshToken;
  } catch {
    // The cookie/header fallbacks below still support non-JSON responses.
  }
  const raw = String(
    (res.headers && (res.headers["Set-Cookie"] || res.headers["set-cookie"])) || ""
  );
  const m = /__Host-za_refresh_token=([^;,\s]+)/.exec(raw);
  if (m) return m[1];
  if (!warnedNoRefreshCookie) {
    warnedNoRefreshCookie = true;
    console.error(
      `refresh-token extraction failed; cookie keys=${JSON.stringify(Object.keys(res.cookies || {}))} header keys=${JSON.stringify(Object.keys(res.headers || {}))}`
    );
  }
  return null;
}

// Pre-registered test users (must exist in the DB)
const testUsers = Array.from({ length: 50 }, (_, i) => ({
  email: `loadtest${i}@example.com`,
  password: "Load@Test1234!",
}));

// k6 isolates module state per VU. Carry the rotated credential between that
// VU's iterations so refresh load does not include an Argon2 login each time.
let refreshToken = null;

/** Scenario 1: Login storm */
export function loginScenario() {
  const user = testUsers[Math.floor(Math.random() * testUsers.length)];

  group("Login", () => {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify(user),
      { headers: { "Content-Type": "application/json" }, timeout: "10s" }
    );
    loginDuration.add(Date.now() - start);
    totalRequests.add(1);

    const ok = check(res, {
      "login status 200": (r) => r.status === 200,
      "has access token": (r) => {
        try { return !!JSON.parse(r.body).accessToken; }
        catch { return false; }
      },
    });
    loginErrorRate.add(!ok);

  });

  sleep(Math.random() * 0.5 + 0.1);
}

/** Scenario 2: Session refresh */
export function refreshScenario() {
  // Use a known test user for refresh
  const user = testUsers[0];

  group("Refresh", () => {
    if (!refreshToken) {
      const loginRes = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify(user),
        { headers: { "Content-Type": "application/json" }, timeout: "10s" }
      );
      totalRequests.add(1);
      if (loginRes.status !== 200) {
        refreshErrorRate.add(true);
        return;
      }
      refreshToken = extractRefreshToken(loginRes);
      if (!refreshToken) {
        refreshErrorRate.add(true);
        return;
      }
    }

    try {
      const start = Date.now();
      const refreshRes = http.post(
        `${BASE_URL}/auth/token/refresh`,
        JSON.stringify({ refreshToken }),
        { headers: { "Content-Type": "application/json" }, timeout: "10s" }
      );
      refreshDuration.add(Date.now() - start);
      totalRequests.add(1);

      const ok = check(refreshRes, {
        "refresh status 200": (r) => r.status === 200,
        "new access token": (r) => {
          try { return !!JSON.parse(r.body).accessToken; }
          catch { return false; }
        },
      });
      refreshErrorRate.add(!ok);
      if (!ok) {
        refreshToken = null;
        return;
      }

      refreshToken = extractRefreshToken(refreshRes);
      if (!refreshToken) refreshErrorRate.add(true);
    } catch {
      refreshToken = null;
      refreshErrorRate.add(true);
    }
  });

  sleep(Math.random() * 0.3 + 0.05);
}

/** Scenario 3: Hot read-only endpoints */
export function readScenario() {
  group("Read endpoints", () => {
    const healthRes = http.get(`${BASE_URL}/health`, { timeout: "5s" });
    readDuration.add(healthRes.timings.duration);
    totalRequests.add(1);
    const healthOk = check(healthRes, {
      "health responds": (r) => r.status < 500,
    });
    readErrorRate.add(!healthOk);

    const metricsRes = http.get(`${BASE_URL}/metrics`, { timeout: "5s" });
    readDuration.add(metricsRes.timings.duration);
    totalRequests.add(1);
    const metricsOk = check(metricsRes, {
      "metrics responds": (r) => r.status < 500,
    });
    readErrorRate.add(!metricsOk);
  });

  sleep(Math.random() * 0.2 + 0.05);
}

/** Scenario 4: Dependency-aggregating status endpoint */
export function statusScenario() {
  group("Status endpoint", () => {
    const statusRes = http.get(`${BASE_URL}/status`, { timeout: "6s" });
    statusDuration.add(statusRes.timings.duration);
    totalRequests.add(1);
    const statusOk = check(statusRes, {
      "status responds": (r) => r.status < 500,
      "status has components": (r) => {
        try { return !!JSON.parse(r.body).components; }
        catch { return false; }
      },
    });
    statusErrorRate.add(!statusOk);
  });
}
