import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const authMiddlewareDuration = new Trend("auth_middleware_duration", true);

export const options = {
  scenarios: {
    auth_cache_hits: {
      executor: "constant-arrival-rate",
      rate: 250,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 50,
      maxVUs: 250,
    },
  },
  thresholds: {
    auth_middleware_duration: ["p(95)<100"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

const headers = {
  Authorization: `Bearer ${AUTH_TOKEN}`,
  "Content-Type": "application/json",
};

export function setup() {
  if (!AUTH_TOKEN) {
    throw new Error("AUTH_TOKEN is required for auth cache k6 test");
  }

  // Warm the 5s user-state cache before the measured storm starts.
  const res = http.get(`${BASE_URL}/auth/me`, { headers });
  check(res, { "warmup /auth/me status is 200": (r) => r.status === 200 });
}

export default function () {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/auth/me`, { headers });
  authMiddlewareDuration.add(Date.now() - start);

  check(res, {
    "/auth/me status is 200": (r) => r.status === 200,
    "user id present": (r) => {
      try {
        return !!JSON.parse(r.body).id;
      } catch {
        return false;
      }
    },
  });

  sleep(0.05);
}
