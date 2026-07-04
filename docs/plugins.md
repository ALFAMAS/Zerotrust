# Plugin system

Feature modules live under `plugins/<id>/`. The API discovers every subdirectory
with an `index.ts` at boot and mounts routes via the plugin loader in
`src/plugins/`. See [`docs/plugins.md`](./plugins.md) for the full contributor guide.

## Quick reference

| Action | How |
| --- | --- |
| **Disable a feature** | Delete `plugins/<id>/` **or** set `DISABLED_PLUGINS=<id>` |
| **Allowlist only some plugins** | `ENABLED_PLUGINS=magic-link,mfa` |
| **List loaded plugins** | `GET /api/plugins` |
| **Add a feature** | Create `plugins/<id>/` with `manifest.ts`, `index.ts`, and optional `routes.ts` |

## Enable / disable

```bash
# Load only these plugins (comma-separated IDs = folder names)
ENABLED_PLUGINS=magic-link,mfa

# Skip specific plugins (applied after discovery)
DISABLED_PLUGINS=oauth
```

When **both** are unset, every discovered plugin loads. Removing a plugin folder
(or listing it in `DISABLED_PLUGINS`) cleanly removes its API routes — no core
code changes required.

## Folder layout

```
plugins/
  <id>/
    manifest.ts    # PluginManifest metadata (id, name, version, apiRoutes, ui hints)
    index.ts       # default export: ZerotrustPlugin { manifest, register(ctx) }
    routes.ts      # Hono router (optional — can register inline in index.ts)
    services/      # optional business logic
    README.md      # optional contributor notes
```

The loader resolves `plugins/<id>/index.ts` in development (Bun/TS) and
`dist/plugins/<id>/index.js` after `bun run build`.

## Plugin contract

```typescript
// plugins/<id>/index.ts
import type { ZerotrustPlugin } from "../../src/plugins/types.js";
import { manifest } from "./manifest.js";
import routes from "./routes.js";

const plugin: ZerotrustPlugin = {
  manifest,
  register(ctx) {
    ctx.app.route("/auth/my-feature", routes);
  },
};

export default plugin;
```

Routes should import core modules via relative paths, e.g.
`import { getDb } from "../../src/db/index.js";` — not `@/` aliases (see Production imports).

### `PluginManifest` fields

| Field | Required | Description |
| --- | --- | --- |
| `id` | yes | Stable ID; must match the folder name |
| `name` | yes | Display name |
| `version` | yes | Semver string |
| `description` | no | Short summary for `/api/plugins` |
| `apiRoutes` | no | `{ mountPath, description? }[]` for docs |
| `env` | no | Documented env vars |
| `ui` | no | Hints for Next.js routes/nav (phased UI migration) |

### `register(ctx)` receives

- `ctx.app` — root Hono instance (global middleware already applied)
- `ctx.config` — loaded `zerotrustConfig`
- `ctx.logger` — namespaced logger (`plugin:<id>`)

Optional future hooks (document only for now): DB migrations in
`plugins/<id>/migrations/`, BullMQ jobs, startup/shutdown lifecycle.

## Security rules (mandatory)

Plugins run with full API access. Follow the same hardening rules as core code
(see `CLAUDE.md`):

- Redirects → `safeRelativeRedirect()` / `isRegisteredRedirectUri()`
- User-influenced fetches → `assertSafeFetchUrl()` + timeout + `redirect: "error"`
- Upload keys → server-derived names + `safeExtensionForContentType()`
- Never log raw tokens/secrets
- List endpoints → `parsePaginatedQuery` + `countRows` + `paginated()`
- Route catch blocks → `internalError()` from `src/shared/httpErrors.ts`

## UI integration (phased)

The Next.js app (`packages/ui/`) is not yet auto-wired from plugins. During
migration:

1. Document UI routes in `manifest.ui`.
2. Optionally fetch `GET /api/plugins` at build time or runtime to hide nav items
   for disabled features.
3. Long term: generate route manifests or use a `plugins/ui/<id>/` convention.

## Examples in this repo

| Plugin | Status | Notes |
| --- | --- | --- |
| `magic-link` | **Migrated** | Routes in `plugins/magic-link/routes.ts` |
| `mfa` | **Migrated** | Routes in `plugins/mfa/routes.ts`; WebAuthn attestation libs remain in `src/mfa/` |
| `oauth` | **Migrated** | Routes + providers in `plugins/oauth/` |

## Migrating an existing feature

1. Create `plugins/<id>/manifest.ts` and `index.ts`.
2. Move the Hono router from `src/api/routes/<feature>.routes.ts` to
   `plugins/<id>/routes.ts`; update imports to **relative paths** into `src/`
   (see Production imports below).
3. Remove the manual `app.route(...)` from `src/api/server.ts`.
4. Move feature-specific services when ready; shared session/crypto helpers stay in `src/`.
5. Run `bun run test` and `bun run boundaries:check`.
6. Document env vars in `manifest.env` and `.env.example`.

## Build

Production builds compile `src/` and `plugins/` together:

```bash
bun run build   # output: dist/src/… and dist/plugins/…
node dist/src/api/server.js
```

### Production imports (required)

TypeScript path aliases (`@/config`, `@/db`, …) are **not** rewritten at compile time.
Plugin code must import core modules with relative paths and `.js` extensions, for example:

```typescript
import { getConfig } from "../../src/config/index.js";
import { getDb } from "../../src/db/index.js";
```

From `plugins/<id>/foo.ts`, `../../src/…` resolves to the repo `src/` tree and compiles
to `dist/plugins/<id>/foo.js` requiring `dist/src/…` — which Node can load without
`tsconfig-paths` or post-build alias rewriting.

Do **not** use `@/` aliases in `plugins/` code.

## Testing

- Unit-test plugin logic in `plugins/<id>/*.test.ts` or `src/__tests__/`.
- Loader tests: `src/__tests__/plugins.loader.test.ts`.

## Related docs

- [`extending.md`](./extending.md) — third-party integrations (OAuth providers, email, storage)
- [`CLAUDE.md`](../CLAUDE.md) — canonical modules and security table
