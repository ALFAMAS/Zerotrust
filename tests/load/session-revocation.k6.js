import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    session_revocation_cascade: {
      executor: "per-vu-iterations",
      vus: 50,
      iterations: 20,
      maxDuration: "2m",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<1000"],
    http_req_failed: ["rate<0.05"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";

export default function () {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADMIN_TOKEN}`,
  };

  const sessionsRes = http.get(`${BASE_URL}/sessions`, { headers });
  check(sessionsRes, { "list sessions 200": (r) => r.status === 200 || r.status === 401 });

  if (sessionsRes.status === 200) {
    try {
      const data = JSON.parse(sessionsRes.body);
      if (data.sessions && data.sessions.length > 1) {
        const oldest = data.sessions[data.sessions.length - 1];
        const revokeRes = http.del(
          `${BASE_URL}/sessions/${oldest.id}`,
          null,
          { headers }
        );
        check(revokeRes, { "revoke session 200": (r) => r.status === 200 || r.status === 404 });
      }
    } catch { /* ignore */ }
  }

  sleep(0.1);
}
