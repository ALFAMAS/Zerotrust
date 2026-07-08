# OAuth plugin

Google, GitHub, Facebook, and Apple OAuth social login. Loaded at API boot when
`plugins/oauth/index.ts` is present and the plugin is enabled.

## Routes (mounted at `/auth`)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/oauth/state` | Mint CSRF state (optional PKCE challenge) |
| GET | `/auth/oauth/:provider/authorize` | Start authorization flow |
| GET | `/auth/oauth/:provider/callback` | Provider callback (redirect + exchange code) |
| POST | `/auth/oauth/exchange` | Redeem short-lived exchange code for tokens |
| DELETE | `/auth/oauth/:provider` | Unlink provider (auth + re-verification) |
| POST | `/auth/me/link` | Link provider to signed-in account |

## Layout

```
plugins/oauth/
  index.ts           # ZerotrustPlugin entry
  manifest.ts        # PluginManifest metadata
  routes.ts          # Hono router
  state.ts           # OAuth state / PKCE storage (Redis + in-memory fallback)
  authorize-url.ts   # Authorization URL builder
  provider.factory.ts
  providers/         # google, github, facebook, apple token exchange
```

Provider adapters use `fetchFixedUrl` (CWE-918) and never put secrets in URLs (CWE-532).

See [`docs/plugins.md`](../../docs/plugins.md) for enable/disable and production import rules.
