/**
 * Full load test suite — exercises all major API endpoints under realistic load.
 *
 * Scenarios:
 *   1. login_storm       — ramping login attempts (read-heavy + write)
 *   2. session_refresh   — constant token refresh rate (read-heavy)
 *   3. mixed_read        — GET /status, /health, /admin/slo (read-only)
 *   4. api_key_calls     — authenticated API calls with key (read + metering)
 *
 * Run with:
 *   k6 run tests/load/full-suite.k6.js -e BASE_URL=http://localhost:1337
 *
 * Profiles (K6_PROFILE):
 *   default — production/staging SLO: API p95 under 100ms for hot auth paths.
 *   ci      — lighter load + relaxed floors for GitHub-hosted runners (p95<500ms).
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const IS_CI = __ENV.K6_PROFILE === "ci";

// Custom metrics
const loginErrorRate = new Rate("login_error_rate");
const refreshErrorRate = new Rate("refresh_error_rate");
const readErrorRate = new Rate("read_error_rate");
const loginDuration = new Trend("login_duration_ms", true);
const refreshDuration = new Trend("refresh_duration_ms", true);
const totalRequests = new Counter("total_requests");

export const options = {
  scenarios: IS_CI
    ? {
        login_storm: {
          executor: "ramping-vus",
          startVUs: 0,
          stages: [
            { duration: "10s", target: 20 },
            { duration: "20s", target: 40 },
            { duration: "10s", target: 0 },
          ],
          exec: "loginScenario",
        },
        session_refresh: {
          executor: "constant-arrival-rate",
          rate: 30,
          timeUnit: "1s",
          duration: "30s",
          preAllocatedVUs: 20,
          maxVUs: 60,
          startTime: "5s",
          exec: "refreshScenario",
        },
        mixed_read: {
          executor: "constant-arrival-rate",
          rate: 50,
          timeUnit: "1s",
          duration: "30s",
          preAllocatedVUs: 15,
          maxVUs: 40,
          startTime: "0s",
          exec: "readScenario",
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
      },
  thresholds: IS_CI
    ? {
        http_req_duration: ["p(95)<500", "p(99)<1000"],
        login_duration_ms: ["p(95)<300"],
        refresh_duration_ms: ["p(95)<300"],
        login_error_rate: ["rate<0.05"],
        refresh_error_rate: ["rate<0.02"],
        read_error_rate: ["rate<0.01"],
        http_req_failed: ["rate<0.01"],
      }
    : {
        http_req_duration: ["p(95)<100", "p(99)<300"],
        login_duration_ms: ["p(95)<100"],
        refresh_duration_ms: ["p(95)<100"],
        login_error_rate: ["rate<0.05"],
        refresh_error_rate: ["rate<0.02"],
        read_error_rate: ["rate<0.01"],
        http_req_failed: ["rate<0.01"],
      },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:1337";

// Pre-registered test users (must exist in the DB)
const testUsers = Array.from({ length: 50 }, (_, i) => ({
  email: `loadtest${i}@example.com`,
  password: "Load@Test1234!",
}));

// Store tokens for refresh scenario
let cachedTokens = null;

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

    if (ok && !cachedTokens) {
      try {
        const body = JSON.parse(res.body);
        cachedTokens = { accessToken: body.accessToken, refreshToken: body.refreshToken };
      } catch { /* ignore */ }
    }
  });

  sleep(Math.random() * 0.5 + 0.1);
}

/** Scenario 2: Session refresh */
export function refreshScenario() {
  // Use a known test user for refresh
  const user = testUsers[0];

  group("Refresh", () => {
    // First login to get a fresh token pair
    const loginRes = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify(user),
      { headers: { "Content-Type": "application/json" }, timeout: "10s" }
    );

    if (loginRes.status === 200) {
      try {
        const body = JSON.parse(loginRes.body);
        const start = Date.now();
        const refreshRes = http.post(
          `${BASE_URL}/auth/token/refresh`,
          JSON.stringify({ refreshToken: body.refreshToken }),
          { headers: { "Content-Type": "application/json" }, timeout: "10s" }
        );
        refreshDuration.add(Date.now() - start);
        totalRequests.add(2);

        const ok = check(refreshRes, {
          "refresh status 200": (r) => r.status === 200,
          "new access token": (r) => {
            try { return !!JSON.parse(r.body).accessToken; }
            catch { return false; }
          },
        });
        refreshErrorRate.add(!ok);
      } catch { /* ignore */ }
    } else {
      totalRequests.add(1);
      refreshErrorRate.add(true);
    }
  });

  sleep(Math.random() * 0.3 + 0.05);
}

/** Scenario 3: Mixed read-only endpoints */
export function readScenario() {
  group("Read endpoints", () => {
    // Health check
    const healthRes = http.get(`${BASE_URL}/health`, { timeout: "5s" });
    totalRequests.add(1);
    check(healthRes, {
      "health responds": (r) => r.status < 500,
    });

    // Status page
    const statusRes = http.get(`${BASE_URL}/status`, { timeout: "5s" });
    totalRequests.add(1);
    const statusOk = check(statusRes, {
      "status responds": (r) => r.status < 500,
      "status has components": (r) => {
        try { return !!JSON.parse(r.body).components; }
        catch { return false; }
      },
    });
    readErrorRate.add(!statusOk);

    // Metrics endpoint
    const metricsRes = http.get(`${BASE_URL}/metrics`, { timeout: "5s" });
    totalRequests.add(1);
    check(metricsRes, {
      "metrics responds": (r) => r.status < 500,
    });
  });

  sleep(Math.random() * 0.2 + 0.05);
}
