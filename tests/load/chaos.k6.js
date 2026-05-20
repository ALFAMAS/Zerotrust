/**
 * Chaos tests — verify graceful degradation when dependencies fail.
 *
 * Run with:
 *   k6 run tests/load/chaos.k6.js -e BASE_URL=http://localhost:3000
 *
 * These tests assume the server is running with one or more dependencies
 * intentionally disabled (e.g. Redis down, Elasticsearch down).
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const degradedErrorRate = new Rate("degraded_error_rate");

export const options = {
  scenarios: {
    // Health check must always report some status, never 5xx crash
    health_probe: {
      executor: "constant-arrival-rate",
      rate: 10,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 5,
    },
    // Login must still work even when Redis is unavailable (falls back to in-memory)
    login_redis_down: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 20 },
        { duration: "20s", target: 20 },
        { duration: "10s", target: 0 },
      ],
      startTime: "5s",
    },
  },
  thresholds: {
    // Health endpoint must always respond (may report degraded but not 5xx)
    "http_req_duration{scenario:health_probe}": ["p(99)<2000"],
    // Login must succeed or return a known error (not crash)
    degraded_error_rate: ["rate<0.10"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export function setup() {
  // Validate server is reachable before chaos run
  const res = http.get(`${BASE_URL}/healthz`);
  if (res.status === 0) {
    throw new Error(`Server at ${BASE_URL} is unreachable`);
  }
}

export default function (data) {
  const scenario = __ENV.SCENARIO || "login_redis_down";

  if (__ITER === undefined || __ENV.K6_SCENARIO_NAME === "health_probe") {
    const healthRes = http.get(`${BASE_URL}/healthz`);
    check(healthRes, {
      "health endpoint responds": (r) => r.status < 500,
      "health has status field": (r) => {
        try {
          return !!JSON.parse(r.body).status;
        } catch {
          return false;
        }
      },
    });
    sleep(0.1);
    return;
  }

  // Login still works (falls back to in-memory rate limiter when Redis is down)
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: "chaos@example.com", password: "Chaos@Test1234!" }),
    { headers: { "Content-Type": "application/json" } }
  );

  const ok = check(loginRes, {
    "login responds (not crash)": (r) => r.status !== 0 && r.status < 500,
    "login returns JSON": (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });

  degradedErrorRate.add(!ok);
  sleep(0.5);
}
