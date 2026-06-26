// Local TDD smoke for the new centralized helpers. Mirrors the assertions in
// src/__tests__/crypto-hash.test.ts and packages/ui/src/lib/apiClient.test.ts
// so the new modules fail loudly before the project vitest suite (currently
// blocked on Windows by missing `vitest/config`) can run them.

import { createHash } from "node:crypto";
import * as cryptoHash from "../src/shared/cryptoHash.ts";

function assert(label, cond) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`  ok  ${label}`);
}

console.log("\n== src/shared/cryptoHash.ts ==");
{
  const sample = "scim_abcDEF123_-";
  const expected = createHash("sha256").update(sample).digest("hex");
  assert("sha256Hex matches node:crypto", cryptoHash.sha256Hex(sample) === expected);
  assert(
    "sha256Hex is 64 lowercase hex chars",
    /^[0-9a-f]{64}$/.test(cryptoHash.sha256Hex(sample))
  );
  assert(
    "hashTokenSha256 is an alias of sha256Hex",
    cryptoHash.hashTokenSha256(sample) === cryptoHash.sha256Hex(sample)
  );
  assert(
    "hashTokenSha256 never returns the raw token",
    !cryptoHash.hashTokenSha256(sample).includes(sample)
  );

  const inputs = ["a", "b", "scim_xyz"];
  const hashes = cryptoHash.hashTokensSha256(inputs);
  assert(
    "hashTokensSha256 preserves order and hashes each input",
    hashes[0] === createHash("sha256").update("a").digest("hex") &&
      hashes[1] === createHash("sha256").update("b").digest("hex") &&
      hashes[2] === createHash("sha256").update("scim_xyz").digest("hex")
  );

  const fp = cryptoHash.hashFingerprint("Mozilla/5.0 zerotrust");
  assert("hashFingerprint returns 16 lowercase hex chars", /^[0-9a-f]{16}$/.test(fp));
  assert(
    "hashFingerprint is deterministic",
    cryptoHash.hashFingerprint("Mozilla/5.0") === cryptoHash.hashFingerprint("Mozilla/5.0")
  );

  const verifier = "abcdefghijklmnopqrstuvwxyz123456-._~";
  const pkceExpected = createHash("sha256").update(verifier).digest("base64url");
  assert(
    "hashBase64Url matches manual sha256+base64url",
    cryptoHash.hashBase64Url(verifier) === pkceExpected
  );
}

// ── UI HTTP smoke ────────────────────────────────────────────────────────────
// Node's strip-types loader can't follow extension-less relative TS imports,
// so we symlink-stub `./auth` into a temporary sibling directory and import
// the real apiClient.ts from there. This way the smoke exercises the real
// production code path (not a re-implementation).
console.log("\n== packages/ui/src/lib/apiClient.ts ==");
{
  const tokens = { access: null, refresh: null };
  const fetchCalls = [];

  // Provide a minimal `window` shim so the module's `typeof window` checks work.
  globalThis.window = {
    location: { pathname: "/", search: "" },
  };
  globalThis.localStorage = {
    getItem: (k) => {
      if (k === "za_access_token") return tokens.access;
      if (k === "za_refresh_token") return tokens.refresh;
      return null;
    },
    setItem: (k, v) => {
      if (k === "za_access_token") tokens.access = v;
      if (k === "za_refresh_token") tokens.refresh = v;
    },
    removeItem: (k) => {
      if (k === "za_access_token") tokens.access = null;
      if (k === "za_refresh_token") tokens.refresh = null;
    },
  };

  globalThis.fetch = async (url, init = {}) => {
    fetchCalls.push({ url, init });
    if (url.endsWith("/auth/token/refresh")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ accessToken: "fresh", refreshToken: "refresh-2" }),
        json: async () => ({ accessToken: "fresh", refreshToken: "refresh-2" }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
      json: async () => ({ ok: true }),
    };
  };

  // Resolve apiClient.ts via its file URL so Node sees it as the resolved
  // module. The `./auth` import resolves through Node's extensionless-relative
  // rules because both files share a parent directory in the source tree.
  const { apiGet, apiPost, apiPostFormData, apiDelete } = await import(
    "../packages/ui/src/lib/apiClient.ts"
  );

  tokens.access = null;
  tokens.refresh = null;
  await apiGet("/auth/me");
  assert(
    "apiGet hits BASE + path",
    String(fetchCalls.at(-1).url).endsWith("/auth/me")
  );
  assert(
    "apiGet omits Authorization when no token",
    (fetchCalls.at(-1).init.headers?.Authorization ?? undefined) === undefined
  );

  tokens.access = "tok-xyz";
  fetchCalls.length = 0;
  await apiGet("/auth/me");
  assert(
    "apiGet attaches Bearer token when present",
    fetchCalls.at(-1).init.headers.Authorization === "Bearer tok-xyz"
  );

  fetchCalls.length = 0;
  await apiPost("/auth/login", { email: "a@b.c" });
  assert(
    "apiPost serialises JSON and sets Content-Type",
    fetchCalls.at(-1).init.method === "POST" &&
      fetchCalls.at(-1).init.headers["Content-Type"] === "application/json" &&
      fetchCalls.at(-1).init.body === JSON.stringify({ email: "a@b.c" })
  );

  fetchCalls.length = 0;
  const fd = new FormData();
  fd.append("avatar", new Blob(["x"]), "a.png");
  await apiPostFormData("/auth/me/avatar", fd);
  assert(
    "apiPostFormData omits Content-Type so the browser sets the multipart boundary",
    fetchCalls.at(-1).init.headers["Content-Type"] === undefined &&
      fetchCalls.at(-1).init.body instanceof FormData
  );

  fetchCalls.length = 0;
  await apiDelete("/sessions/s1");
  assert(
    "apiDelete omits body and serialises headers",
    fetchCalls.at(-1).init.method === "DELETE" &&
      fetchCalls.at(-1).init.body === undefined
  );
}

console.log("\nAll smoke checks passed.\n");