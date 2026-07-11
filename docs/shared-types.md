# Shared Zod schemas (`@zerotrust/shared-types`)

Single source of truth for request validation shapes shared between the Hono API
and Next.js UI — reduces drift that the API↔UI integration matrix currently
catches after the fact.

## Package

| Path | Role |
| --- | --- |
| `packages/shared-types/` | Workspace package `@zerotrust/shared-types` |
| `src/pagination.ts` | `paginationQuerySchema`, `parsePaginationQuery` |
| `src/auth.ts` | `registerSchema`, `registerBodySchema` |
| `src/org.ts` | `createOrgSchema`, `orgInviteSchema`, `acceptOrgInviteSchema` |
| `src/errors.ts` | `apiErrorEnvelopeSchema` |

## Usage

**API** — import schemas in route modules or re-export from `src/api/schemas/`:

```ts
import { acceptOrgInviteSchema, registerSchema } from "@zerotrust/shared-types";
```

**UI** — import types and validators in server-state modules:

```ts
import type { RegisterInput } from "@zerotrust/shared-types";
import { acceptOrgInviteSchema } from "@zerotrust/shared-types";
```

See [`packages/ui/src/lib/server-state/types.ts`](../packages/ui/src/lib/server-state/types.ts)
and [`packages/ui/src/lib/server-state/orgInvites.ts`](../packages/ui/src/lib/server-state/orgInvites.ts).

## SDK codegen (next step)

`packages/client` SDK generation does not yet import shared-types schemas.
When extending codegen, export OpenAPI-compatible Zod metadata from this package
so generated client types stay aligned.

## Tests

```bash
bun run --cwd packages/shared-types test
```

Schema parity tests live in `packages/shared-types/src/schemas.test.ts`.

See also [`ui-http-client.md`](./ui-http-client.md) for the TanStack Query layer.
