/**
 * Chaos / fault injection tests — verify graceful degradation under adverse conditions.
 *
 * These tests verify that the system remains available and returns meaningful
 * responses even when dependencies are degraded or under extreme load.
 *
 * Scenarios:
 *   1. health_under_load    — health endpoint must stay responsive during traffic
 *   2. login_degraded      — login works (or degrades gracefully) under stress
 *   3. metrics_available   — Prometheus metrics endpoint stays up
 *   4. slo_endpoint        — SLO status endpoint returns valid data
 *   5. circuit_breaker     — rapid sequential failures don't cascade
 *
 * Run with:
 *   k6 run tests/load/chaos-fault.k6.js -e BASE_URL=http://localhost:1337
 *
 * For actual fault injection, stop Redis/ES before running:
 *   docker stop zerotrust-redis
 *   k6 run tests/load/chaos-fault.k6.js -e BASE_URL=http://localhost:1337
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const healthErrorRate = new Rate("health_error_rate");
const loginDegradedErrorRate = new Rate("login_degraded_error_rate");
const metricsErrorRate = new Rate("metrics_error_rate");
const sloErrorRate = new Rate("slo_error_rate");
const circuitBreakerTrips = new Counter("circuit_breaker_trips");
const healthDuration = new Trend("health_duration_ms", true);

export const options = {
  scenarios: {
    // Health must always respond, even under heavy concurrent load
    health_under_load: {
      executor: "constant-arrival-rate",
      rate: 500,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 100,
      maxVUs: 300,
    },
    // Login under degraded conditions (Redis may be down)
    login_degraded: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 50 },
        { duration: "30s", target: 100 },
        { duration: "15s", target: 0 },
      ],
      startTime: "5s",
    },
    // Metrics endpoint must stay available
    metrics_available: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 20,
      maxVUs: 50,
      startTime: "0s",
    },
    // SLO endpoint check
    slo_endpoint: {
      executor: "constant-arrival-rate",
      rate: 20,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 10,
      maxVUs: 20,
      startTime: "0s",
    },
    // Circuit breaker: rapid sequential requests to trigger rate limiting
    circuit_breaker: {
      executor: "shared-iterations",
      vus: 10,
      iterations: 200,
      maxDuration: "30s",
      startTime: "10s",
    },
  },
  thresholds: {
    // Health endpoint: must always respond, p99 under 2s even under load
    "http_req_duration{scenario:health_under_load}": ["p(99)<2000"],
    health_error_rate: ["rate<0.01"],
    // Login: degraded is OK (429, 503), but no 500 crashes
    login_degraded_error_rate: ["rate<0.15"],
    // Metrics: must stay up
    metrics_error_rate: ["rate<0.01"],
    // SLO: must stay up
    slo_error_rate: ["rate<0.05"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:1337";

export function setup() {
  // Validate server is reachable
  const res = http.get(`${BASE_URL}/health`, { timeout: "5s" });
  if (res.status === 0) {
    throw new Error(`Server at ${BASE_URL} is unreachable`);
  }
  return { serverReachable: true };
}

/** Scenario 1: Health under load */
export function health_under_load() {
  group("Health under load", () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/health`, { timeout: "5s" });
    healthDuration.add(Date.now() - start);

    const ok = check(res, {
      "health responds (not 5xx)": (r) => r.status !== 0 && r.status < 500,
      "health has status": (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.status !== undefined;
        } catch { return false; }
      },
    });
    healthErrorRate.add(!ok);
  });
}

/** Scenario 2: Login degraded */
export function login_degraded() {
  group("Login degraded", () => {
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: "chaos@example.com", password: "Chaos@Test1234!" }),
      { headers: { "Content-Type": "application/json" }, timeout: "10s" }
    );

    // Accept 200 (success), 401 (bad creds), 429 (rate limited), 503 (degraded)
    // Reject 500 (crash), 0 (timeout/unreachable)
    const ok = check(res, {
      "login does not crash": (r) => r.status !== 0 && r.status < 500,
      "login returns JSON": (r) => {
        try { JSON.parse(r.body); return true; }
        catch { return false; }
      },
    });
    loginDegradedErrorRate.add(!ok);
  });

  sleep(Math.random() * 0.5 + 0.1);
}

/** Scenario 3: Metrics available */
export function metrics_available() {
  group("Metrics available", () => {
    const res = http.get(`${BASE_URL}/metrics`, { timeout: "5s" });

    const ok = check(res, {
      "metrics responds": (r) => r.status < 500,
      "metrics has prometheus format": (r) => {
        try {
          const body = r.body;
          return body.includes("zerotrust_") || body.includes("process_") || body.includes("nodejs_");
        } catch { return false; }
      },
    });
    metricsErrorRate.add(!ok);
  });
}

/** Scenario 4: SLO endpoint */
export function slo_endpoint() {
  group("SLO endpoint", () => {
    const res = http.get(`${BASE_URL}/admin/slo`, { timeout: "5s" });

    const ok = check(res, {
      "SLO responds": (r) => r.status < 500,
      "SLO has structure": (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.availability !== undefined || body.error !== undefined;
        } catch { return false; }
      },
    });
    sloErrorRate.add(!ok);
  });
}

/** Scenario 5: Circuit breaker — rapid sequential requests */
export function circuit_breaker() {
  group("Circuit breaker", () => {
    // Send rapid requests to trigger rate limiting
    for (let i = 0; i < 5; i++) {
      const res = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({ email: `circuit${i}@example.com`, password: "Wrong!" }),
        { headers: { "Content-Type": "application/json" }, timeout: "5s" }
      );

      // 429 = rate limiter working (good), 401 = auth working (good)
      // 500 = crash (bad)
      if (res.status >= 500) {
        circuitBreakerTrips.add(1);
      }

      check(res, {
        "no server crash": (r) => r.status < 500,
      });
    }
  });

  sleep(0.05);
}
