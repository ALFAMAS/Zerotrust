import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("error_rate");
const loginDuration = new Trend("login_duration", true);

export const options = {
  scenarios: {
    concurrent_logins: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },
        { duration: "60s", target: 1000 },
        { duration: "30s", target: 0 },
      ],
    },
    refresh_storm: {
      executor: "constant-arrival-rate",
      rate: 200,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 50,
      maxVUs: 200,
      startTime: "30s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    error_rate: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

const testUsers = Array.from({ length: 20 }, (_, i) => ({
  email: `loadtest${i}@example.com`,
  password: "Load@Test1234!",
}));

export default function () {
  const user = testUsers[Math.floor(Math.random() * testUsers.length)];

  const loginStart = Date.now();
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify(user),
    { headers: { "Content-Type": "application/json" } }
  );
  loginDuration.add(Date.now() - loginStart);

  const loginOk = check(loginRes, {
    "login status is 200": (r) => r.status === 200,
    "access token present": (r) => {
      try { return !!JSON.parse(r.body).accessToken; }
      catch { return false; }
    },
  });
  errorRate.add(!loginOk);

  if (loginOk && loginRes.status === 200) {
    try {
      const body = JSON.parse(loginRes.body);
      const refreshRes = http.post(
        `${BASE_URL}/auth/token/refresh`,
        JSON.stringify({ refreshToken: body.refreshToken }),
        { headers: { "Content-Type": "application/json" } }
      );
      check(refreshRes, { "refresh status is 200": (r) => r.status === 200 });
    } catch { /* ignore parse errors */ }
  }

  sleep(Math.random() * 0.5 + 0.1);
}
