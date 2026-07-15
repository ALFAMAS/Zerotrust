const isolatedStack = process.env.E2E_ISOLATED_STACK === "true";

export const E2E_API_URL = isolatedStack
  ? "http://localhost:1437"
  : "http://localhost:1337";

export const E2E_APP_URL = isolatedStack
  ? "http://localhost:3100"
  : "http://localhost:3000";
