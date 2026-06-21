# ZeroAuth — Incomplete & Unmounted Code

A code-level audit of what exists in the repository but is **unreachable, stubbed,
or orphaned** — as opposed to [`not-implemented.md`](./not-implemented.md), which
is the _product_ backlog (features that were never built). This file is about code
that _is_ in the tree but isn't finished or isn't wired in.

**Method:** knowledge graph (`graphify-out/`, `graph.html` / `GRAPH_REPORT.md`)
+ targeted static checks — route-mount diff against `src/api/server.ts`, a
`NotImplementedError` / `501` / stub sweep, and an orphan-component import scan of
`packages/ui/`.

**Severity:** 🔴 reachable gap or wired-but-unmounted · 🟡 intentional stub (throws
loudly, documented) · ⚪ dead/orphaned scaffolding (no runtime impact) · 📄 doc drift

Last audited: 2026-06-22.

---

## 🔴 Unmounted routers

### `src/notifications/routes.ts` — notification-channel management API is never mounted

A complete Hono router exporting six endpoints for managing alerting/notification
channels:

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST   | `/test` | send a test notification |
| GET    | `/config` | list configured channels |
| GET    | `/channels` | list channels (optional `tenantId` filter) |
| POST   | `/channels` | add a channel |
| PATCH  | `/channels/:id` | update a channel |
| DELETE | `/channels/:id` | remove a channel |
| POST   | `/channels/:id/test` | test a specific channel |

It is **never imported in `src/api/server.ts`**, so none of these routes are
reachable. `server.ts` mounts a _different_ file at `/notifications` —
`src/api/routes/notification.routes.ts` (user-facing SSE / web-push / in-app
notifications) — which is unrelated to channel management.

The underlying `notificationDispatcher` it wraps **is** used (by
`src/services/alerting.service.ts`), so channels currently can only be configured
from env (`initNotificationsFromEnv`), not over HTTP. No UI consumes these routes
either, so this is dead code rather than a live bug.

**Resolve by:** either mount it (e.g. `app.route("/admin/notifications", notificationRoutes)`
behind `authMiddleware` + admin guard) and add the admin UI, or delete the file if
env-only configuration is intended.

---

## 🟡 Stubbed implementations (throw or return 501)

### `src/crypto/hardware-key-store.ts` — three hardware providers are stubs

`SoftwareKeyProvider` is fully implemented and is the default. The hardware-backed
providers exist as class skeletons whose every method throws `NotImplementedError`
(class defined at `:181`):

- **`TPMKeyProvider`** (`:189`) — methods throw at `:209, :215, :221, :227, :233, :239`
- **`SecureEnclaveProvider`** (`:248`) — methods throw at `:268, :274, :280, :286, :292, :298`
- **`PKCS11Provider`** (`:307`) — methods throw at `:325, :331, :337, :343, :349, :355`
  (header comment documents the intended `pkcs11js` wiring)

**Resolve by:** implement against `node-tpm2` / `pkcs11js` / a Secure Enclave bridge,
or document these as "software-only" and gate provider selection so a misconfigured
`KEY_PROVIDER=tpm` fails fast at startup rather than at first use.

### `src/scim/routes.ts` — SCIM Group provisioning is a stub

- `GET /Groups` (`:434`) always returns an empty `ListResponse` (`totalResults: 0`).
- `POST /Groups` (`:448`) returns `501` `"Groups are not supported"`.

User provisioning (`/Users`) is complete; only Groups are unimplemented. Acceptable
for SCIM 2.0 user-sync, but IdPs that push groups will get a 501.

### `src/did/routes.ts` — DID login stops at verification

`POST /auth/did/verify` (`:55`) is a sound proof-of-control verifier, but it does
**not** issue a ZeroAuth session. The header comment (`:48-54`) states
`provisionDIDUser()` is still a stub and the `users` table has no `did` column, so
"login via DID" is intentionally deferred. The challenge + verify half-flow works;
the account-provisioning half does not exist yet.

**Resolve by:** add a `did` column (migration) + a Drizzle-backed `provisionDIDUser()`
upsert, then issue tokens from `/verify` on success.

---

## ⚪ Orphaned UI (built, never imported)

Confirmed via import scan of `packages/ui/src` — defined/exported but with zero
importers:

- **`components/StatCard.tsx`** — superseded by `components/admin/MetricCard.tsx`
  (whose own comment notes it "replaces the emoji StatCard in admin"). Safe to delete.
- **`components/UpgradePrompt.tsx`** — exported with a usage example in its own JSDoc,
  but never rendered anywhere. The plan-gating UI it was built for was never wired in.
- **Unused shadcn/ui primitives** — generated but never imported:
  `components/ui/dropdown-menu.tsx`, `select.tsx`, `separator.tsx`, `skeleton.tsx`,
  `table.tsx`, `tabs.tsx`, `tooltip.tsx`. No runtime cost (tree-shaken from the
  bundle), but they're dead scaffolding.

**Resolve by:** delete `StatCard`; either wire `UpgradePrompt` into the plan-gate
paths or remove it; leave or prune the shadcn primitives per preference.

---

## 📄 Documentation drift

These aren't code, but they're "incomplete" in the sense that the docs no longer
match the tree (the `docs/` directory was deleted, and `implemented.md` /
`not-implemented.md` are meant to stay in lockstep):

- **`not-implemented.md:272`** links `docs/backup-restore.md`, which no longer exists
  (the entire `docs/` folder was removed). The "Backup restore drill" evidence
  reference is now a dead link.
- **`not-implemented.md` → "File storage & uploads → S3-compatible storage"** is still
  listed as a backlog item, but it shipped — see `implemented.md:295-296`
  (`src/services/objectStorage.service.ts`, S3-backed avatar uploads). Lockstep
  violation; should be removed from the backlog.
- **`README.md`** links the deleted `STARTER.md` (addressed by the README rewrite).

---

## Verified _not_ incomplete (excluded after review)

- **`src/crypto/post-quantum.ts`** — the `// Stub for @noble/post-quantum` comment is
  misleading: `NobleMLKEM` is a **complete** provider that uses real ML-KEM-768 when
  the optional `@noble/post-quantum` dependency is installed, and falls back to a
  clearly-labelled classical `SimulatedMLKEM` (ECDH P-256) with a loud warning, or
  hard-fails when `PQ_REQUIRE_REAL=true`. This is a graceful optional-dependency
  pattern, not unfinished code.
- **Every `*.routes.ts` under `src/` except `src/notifications/routes.ts`** is imported
  and mounted in `server.ts` (verified by import/mount diff).

---

## Summary

| # | Item | Type | Severity |
| - | ---- | ---- | -------- |
| 1 | `src/notifications/routes.ts` channel API | unmounted router | 🔴 |
| 2 | `hardware-key-store.ts` TPM/SecureEnclave/PKCS11 | stub (throws) | 🟡 |
| 3 | `scim/routes.ts` `/Groups` | stub (501 / empty) | 🟡 |
| 4 | `did/routes.ts` DID→session login | stub (`provisionDIDUser`) | 🟡 |
| 5 | `StatCard.tsx`, `UpgradePrompt.tsx` | orphan components | ⚪ |
| 6 | 7× unused `components/ui/*` primitives | dead scaffolding | ⚪ |
| 7 | `not-implemented.md` dead link + S3 lockstep drift | doc drift | 📄 |
