# @zerotrust/client

Dependency-free TypeScript client for the [zerotrust](https://github.com/ALFAMAS/zerotrust) API.

The client is generated from [`src/api/openapi.json`](../../src/api/openapi.json) by
[`scripts/generate-sdk.ts`](../../scripts/generate-sdk.ts). It targets the global
`fetch` runtime (Node 18+, Bun, Deno, browsers, and Workers) and provides typed
request bodies, query params, path params, and response types for every operation
currently described in the OpenAPI spec.

> `src/index.ts` is generated — **do not edit by hand**. Regenerate from the repo
> root with `bun run sdk:generate` after changing the OpenAPI spec.

---

## Install

```bash
npm install @zerotrust/client
# or
pnpm add @zerotrust/client
# or
bun add @zerotrust/client
```

---

## Create a client

```ts
import { zerotrustClient, zerotrustError } from "@zerotrust/client";

const client = new zerotrustClient({
  baseUrl: "https://api.example.com",
  headers: {
    "X-Request-Source": "docs-example",
  },
});
```

### Options

| Option | Type | Description |
| --- | --- | --- |
| `baseUrl` | `string` | API base URL. Defaults to the OpenAPI `servers[0].url`. |
| `token` | `string` | Bearer PASETO access token sent as `Authorization`. |
| `fetch` | `typeof fetch` | Custom fetch implementation. Defaults to `globalThis.fetch`. |
| `headers` | `Record<string, string>` | Extra headers merged into every request. |

---

## Auth: register, login, refresh, logout

```ts
const created = await client.postAuthRegister({
  email: "ada@example.com",
  password: "correct-horse-battery-staple",
  displayName: "Ada Lovelace",
});

const tokens = await client.postAuthLogin({
  email: "ada@example.com",
  password: "correct-horse-battery-staple",
});

client.setToken(tokens.accessToken);

// Later, rotate the refresh token and update the access token in-place.
const refreshed = await client.postAuthTokenRefresh({
  refreshToken: tokens.refreshToken!,
});
client.setToken(refreshed.accessToken);

await client.postAuthLogout();
client.setToken(undefined);
```

---

## Sessions

```ts
client.setToken(accessToken);

const { sessions } = await client.getSessions({
  limit: 20,
  activeOnly: true,
});

await client.deleteSessionsById(sessions?.[0]?.id ?? "session-id");

// Keep the current session, revoke every other session.
await client.deleteSessions();
```

---

## Organizations

```ts
client.setToken(accessToken);

const org = await client.postOrgs({
  name: "Example Inc.",
  slug: "example-inc",
});

const orgs = await client.getOrgs();

await client.putOrgsByOrgId("org_123", {
  name: "Example Labs",
  billingEmail: "billing@example.com",
});

await client.postOrgsByOrgIdInvites("org_123", {
  email: "teammate@example.com",
  role: "member",
});

const members = await client.getOrgsByOrgIdMembers("org_123");
```

---

## MFA and passkeys

### TOTP

```ts
client.setToken(accessToken);

const setup = await client.postAuthMfaTotpSetup();
console.log(setup.qrDataUrl); // show this QR code to the user

const verified = await client.postAuthMfaTotpVerify({ code: "123456" });
console.log(verified.backupCodes); // show once, then store client-side securely
```

### Email OTP

```ts
await client.postAuthMfaOtpSend({
  channel: "email",
  target: "ada@example.com",
});

await client.postAuthMfaOtpVerify({
  channel: "email",
  code: "123456",
});
```

### Passkeys / WebAuthn

The SDK exposes the server endpoints; browser WebAuthn calls still use
`navigator.credentials` or `@simplewebauthn/browser`.

```ts
client.setToken(accessToken);

const options = await client.postAuthPasskeyRegisterOptions();

// Browser-side ceremony omitted: pass `options` to startRegistration(...).
const credential = await startRegistration(options as never);

await client.postAuthPasskeyRegister({
  body: credential as Record<string, unknown>,
  name: "MacBook Touch ID",
});
```

---

## Admin operations

Admin methods require an access token for a user with admin permissions.

```ts
const admin = new zerotrustClient({
  baseUrl: "https://api.example.com",
  token: adminAccessToken,
});

const users = await admin.getAdminUsers({
  limit: 50,
  search: "ada@example.com",
});

await admin.patchAdminUsersById("user_123", {
  status: "active",
  displayName: "Ada",
});

await admin.postAdminUsersByIdRoles("user_123", {
  roleName: "admin",
});

await admin.getAdminAuditLogs({
  limit: 100,
  action: "auth.login",
});
```

---

## Shared Signals Framework (SSF)

```ts
await client.postSsfEvents({
  iss: "https://provider.example.com",
  aud: "zerotrust",
  jti: crypto.randomUUID(),
  iat: Math.floor(Date.now() / 1000),
  events: {
    "https://schemas.openid.net/secevent/risc/event-type/account-disabled": {
      subject: { format: "email", email: "ada@example.com" },
    },
  },
});
```

---

## Health checks

```ts
const health = await client.getHealthz();
console.log(health.status, health.redis, health.elasticsearch);
```

---

## Error handling

Every non-2xx response throws `zerotrustError` with `status`, `code`, and
`details` from the API error envelope when available.

```ts
try {
  await client.getAdminUsers();
} catch (error) {
  if (error instanceof zerotrustError) {
    console.error(error.status, error.code, error.message, error.details);
  } else {
    throw error;
  }
}
```

---

## Low-level request escape hatch

If an endpoint exists in the API but has not yet been added to `openapi.json`, use
the typed low-level request helper until the spec is expanded.

```ts
const wallet = await client.request<{
  balance: number;
  currency: string;
}>("GET", "/wallet");
```

Prefer adding the route to `src/api/openapi.json` and regenerating the SDK over
using the escape hatch long-term.

---

## Regenerating

```bash
# from the repo root
bun run sdk:generate     # regenerate packages/client/src/index.ts
bun run sdk:build        # regenerate + type-check the client package
bun run docs:api         # regenerate docs/api-reference.md
```
