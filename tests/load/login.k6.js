import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("error_rate");
const loginDuration = new Trend("login_duration", true);

export const options = {
  scenarios: {
    login_storm: {
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
    login_duration: ["p(95)<100"],
    error_rate: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

// The API returns the refresh token only as a Secure __Host- cookie
// (ADR 008 / SEC-9). Over plain http, cookie-prefix rules make clients
// reject __Host- cookies, so k6's jar/cookie map may not expose it —
// fall back to parsing the raw Set-Cookie header. The refresh endpoint
// still accepts the token via the body field.
let warnedNoRefreshCookie = false;
function extractRefreshToken(res) {
  const fromMap = res.cookies && res.cookies["__Host-za_refresh_token"];
  if (fromMap && fromMap.length > 0 && fromMap[0].value) return fromMap[0].value;
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
      const refreshToken = extractRefreshToken(loginRes);
      const refreshRes = http.post(
        `${BASE_URL}/auth/token/refresh`,
        JSON.stringify({ refreshToken }),
        { headers: { "Content-Type": "application/json" } }
      );
      check(refreshRes, { "refresh status is 200": (r) => r.status === 200 });
    } catch { /* ignore parse errors */ }
  }

  sleep(Math.random() * 0.5 + 0.1);
}
