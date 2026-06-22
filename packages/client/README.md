# @zeroauth/client

Auto-generated, **dependency-free** TypeScript client for the [ZeroAuth](https://github.com/ALFAMAS/zeroauth) API.

The client is generated from the OpenAPI spec (`src/api/openapi.json`) by
[`scripts/generate-sdk.ts`](../../scripts/generate-sdk.ts). It targets the global
`fetch` (Node 18+, Bun, Deno, and browsers) and ships fully-typed request bodies,
query params, path params, and response types.

> ⚠️ `src/index.ts` is generated — **do not edit by hand**. Regenerate with
> `bun run sdk:generate` (from the repo root) after changing the OpenAPI spec.

## Install

```bash
npm install @zeroauth/client
```

## Usage

```ts
import { ZeroAuthClient, ZeroAuthError } from "@zeroauth/client";

const client = new ZeroAuthClient({
  baseUrl: "https://api.zeroauth.app",
});

// Email + password login → typed TokenResponse
const tokens = await client.postAuthLogin({
  email: "ada@example.com",
  password: "correct-horse-battery-staple",
});

// Authenticate subsequent calls with the issued access token.
client.setToken(tokens.accessToken);

// List active sessions (query params are typed).
const { sessions } = await client.getSessions({ limit: 20, activeOnly: true });

try {
  await client.deleteSessionsById("does-not-exist");
} catch (err) {
  if (err instanceof ZeroAuthError) {
    console.error(err.status, err.code, err.message);
  }
}
```

### Options

| Option    | Type                       | Description                                             |
| --------- | -------------------------- | ------------------------------------------------------- |
| `baseUrl` | `string`                   | API base URL. Defaults to the OpenAPI `servers[0].url`. |
| `token`   | `string`                   | Bearer (PASETO) token sent as `Authorization`.          |
| `fetch`   | `typeof fetch`             | Custom fetch (defaults to the global `fetch`).          |
| `headers` | `Record<string, string>`   | Extra headers merged into every request.                |

Every non-2xx response throws a `ZeroAuthError` carrying the HTTP `status`,
the API error `code`, and the parsed `details`.

## Regenerating

```bash
# from the repo root
bun run sdk:generate     # regenerate src/index.ts from the OpenAPI spec
bun run sdk:build        # regenerate + emit dist/ (tsc)
```
