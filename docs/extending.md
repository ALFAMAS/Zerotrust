# Extending zerotrust

How to plug new third-party integrations into the platform. The architecture is
**env-first** (most providers switch via configuration, no code) and uses small
**adapter modules** where code is needed (OAuth). For **self-contained features**
(auth methods, billing add-ons, etc.), use the [**plugin system**](./plugins.md)
(`plugins/<id>/` folders loaded at API boot).

> See also the **Customizing** section of the [README](../README.md) for
> renaming the app, adding an API route, custom org roles, and adding a locale.

---

## Add an OAuth provider

OAuth providers are adapters behind a factory, so adding one is two small files
of change plus env.

1. **Implement the adapter** — create `plugins/oauth/providers/<name>.ts` exporting
   an `exchangeCode` that returns the normalized shape the callback consumes
   (copy `google.ts`/`github.ts` as a template):

   ```ts
   // plugins/oauth/providers/<name>.ts
   import type { NormalizedProfile } from "../provider.factory.js";

   export async function exchangeCode(
     code: string,
     clientId: string,
     clientSecret: string,
     redirectUri: string,
     codeVerifier?: string,
   ): Promise<{ tokens: unknown; profile: NormalizedProfile }> {
     // 1. POST the code to the provider's token endpoint
     // 2. fetch the userinfo endpoint
     // 3. return a NormalizedProfile: { id, email?, name?, emailVerified? }
   }
   ```

2. **Register it in the factory** — add a `case "<name>"` to
   `getProviderAdapter()` in `plugins/oauth/provider.factory.ts` that dynamically
   imports your module (mirror the existing `google`/`github` cases). Providers
   configured but missing a case fail loudly with `UNSUPPORTED_OAUTH_PROVIDER`.

3. **Configure credentials** — set `OAUTH_<NAME>_CLIENT_ID`,
   `OAUTH_<NAME>_CLIENT_SECRET`, `OAUTH_<NAME>_REDIRECT_URI` (the config loader
   exposes them as `cfg.oauth.providers["<name>"]`).

4. **Enable it** — Admin → **Auth Settings** toggles providers live (no restart).

**Contract:** always return a stable string `id` and set `emailVerified`
truthfully — downstream account-linking trusts it. Own all HTTP/error handling
inside the adapter; the factory only routes.

---

## Swap or configure the email provider

Email goes through one nodemailer transport in
`src/services/email.service.ts` (`getTransport()`).

- **Any SMTP provider (SendGrid, SES, Postmark, Mailgun…):** set `MAIL_HOST`,
  `MAIL_PORT` (`465` ⇒ TLS), `MAIL_USER`, `MAIL_PASSWORD`, and `MAIL_FROM`. No
  code change.
- **A non-SMTP API SDK:** replace the `nodemailer.createTransport(...)` call in
  `getTransport()` with the SDK's transport. Keep the function's return type so
  every caller (`sendEmail`, queue worker) is unaffected.
- **Local/dev:** with `MAIL_HOST` unset the transport falls back to
  `jsonTransport` (emails are logged, not sent) — handy for tests.

The BullMQ email queue (`src/services/emailQueue.ts`) sits in front of this when
Redis is configured; you don't touch it to change providers.

---

## Use a different object-storage provider

`src/services/objectStorage.service.ts` is already provider-agnostic — the only
switch is configuration. It backs both DB backups (`backups/` prefix) and user
uploads (`uploads/` prefix).

| Provider                                      | Settings                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| AWS S3                                        | `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` |
| Cloudflare R2 / Backblaze B2 / MinIO / Wasabi | the above **plus** `BACKUP_S3_ENDPOINT` and `BACKUP_S3_FORCE_PATH_STYLE=true`                    |

Unset ⇒ backups stay local and avatar uploads fall back to local disk. Use
`UPLOADS_S3_*` to point uploads at a separate bucket/prefix.

---

## MFA / OTP channels

MFA currently supports TOTP and Email OTP. Email OTP uses the same Nodemailer
SMTP transport as transactional email (see above). To add a new MFA channel
(e.g. SMS via Twilio, push-based), implement a sender with the same
`(recipient, message) => Promise<void>` shape the OTP dispatcher calls and wire
it in `src/services/auth/otpDelivery.service.ts`. Register the channel name in the settings model and UI.

---

## Pluggability checklist (for any new integration)

- **Config over code:** read credentials from `process.env` via the config
  loader; never hardcode or commit secrets. Add the keys to `.env.example` with
  a comment.
- **Fail closed / loud:** a configured-but-broken provider should throw a
  specific error, not silently degrade (see `UNSUPPORTED_OAUTH_PROVIDER`).
- **Graceful when unset:** an unconfigured optional integration must no-op, not
  crash boot (mirror the storage/email fallbacks).
- **Test the adapter in isolation:** adapters are plain functions — unit-test the
  happy path + a provider-error path with the network mocked (see
  `src/__tests__/oauth.test.ts`).
- **Document it here** and in `.env.example`.

---

## Add frontend data fetching (TanStack Query)

All dashboard/admin pages fetch API data through TanStack Query hooks in
`packages/ui/src/lib/server-state/`, not ad-hoc `useEffect` + `apiClient` calls
in page components.

### Architecture

| Piece | Location |
| --- | --- |
| App provider | `packages/ui/src/components/QueryProvider.tsx` (mounted in root `app/layout.tsx`) |
| Query key factory | `packages/ui/src/lib/server-state/queryKeys.ts` |
| Domain module | `packages/ui/src/lib/server-state/<domain>.ts` — fetchers, `queryOptions`, hooks, mutations |
| Shared types | `packages/ui/src/lib/server-state/types.ts` |
| RSC prefetch | `packages/ui/src/lib/server-state/prefetch.ts` + `HydrationBoundary` in `page.tsx` |
| Stale/refetch UI | `packages/ui/src/components/ServerStateStatus.tsx` |

HTTP still goes through `apiClient.ts` (`apiGet`, `apiPost`, …) — **inside**
server-state modules only.

### Checklist for a new page or API surface

1. **Add query keys** — extend `queryKeys.ts` with a stable hierarchical key
   (e.g. `queryKeys.widgets.list({ page })`).
2. **Create or extend a domain module** — mirror `apiKeys.ts`:
   - `fetch*` functions calling `apiClient`
   - `*QueryOptions()` using `queryOptions({ queryKey, queryFn, enabled })`
   - `use*Query()` / `use*Mutation()` hooks exported for pages
3. **Mutations** — use `useMutation`; call
   `queryClient.invalidateQueries({ queryKey: … })` on `onSettled` (or optimistic
   updates with rollback when the list is simple).
4. **Page component** — import hooks from `@/lib/server-state/<domain>`; keep
   forms, modals, and filters as local `useState`.
5. **Tests** — mock `@/lib/apiClient` via `@/test/apiClientMock`; test the
   client component. Add `queryKeys` coverage when keys are non-trivial.
6. **Optional RSC prefetch** — for high-traffic reads, add fetchers to
   `prefetch.ts` and wrap the page in `HydrationBoundary` (see
   [`docs/ui-http-client.md`](./ui-http-client.md)).

TanStack Query migration is complete — see [`docs/ui-http-client.md`](./ui-http-client.md).

---

## Hardware-backed key store (TPM / HSM fork path)

zerotrust ships a **software key provider** by default (`SoftwareKeyProvider` in
`src/crypto/hardware-key-store.ts`). CSFLE field encryption uses its own
`CSFLE_MASTER_KEY_HEX` derivation path; the hardware key-store abstraction is the
fork point for operators who need TPM 2.0, Apple Secure Enclave, or PKCS#11 HSM
backing for signing / envelope encryption workloads (PASETO keys, token signing,
etc.).

### What ships today

| `KEY_PROVIDER` | Behaviour |
| -------------- | --------- |
| unset / `auto` | Software provider; logs if TPM / Secure Enclave hardware is detected but unsupported |
| `software`     | Software provider (HKDF + AES-256-GCM in memory) |
| `tpm` / `tpm2` / `secure-enclave` / `pkcs11` / `hsm` | **Fail fast at boot** — stubs are not silently selected |

Boot calls `initHardwareKeyStore()` from `initializezerotrust()`; consumers use
`getHardwareKeyStore()`.

### Environment variables

| Variable | Purpose |
| -------- | ------- |
| `KEY_PROVIDER` | `auto` (default), `software`, or a hardware selector (requires fork) |
| `HW_KEY_MASTER_SECRET` | Optional 32-byte hex master for `SoftwareKeyProvider` HKDF (falls back to `TOKEN_SECRET_HEX`) |
| `HW_KEY_PKCS11_LIB` | Path to PKCS#11 `.so` / `.dylib` — used only for hardware detection logging in `auto` mode |
| `HW_KEY_PKCS11_PIN` | PKCS#11 user PIN (fork implementations only) |

CSFLE continues to use `CSFLE_MASTER_KEY_HEX` independently.

### Fork checklist (add real TPM / HSM support)

1. **Pick a provider class** — `TPMKeyProvider`, `SecureEnclaveProvider`, or
   `PKCS11Provider` in `src/crypto/hardware-key-store.ts`. Each class has JSDoc
   with the native dependency to install (`tpm2-tools` + `node-tpm2`, CryptoKit
   addon, or `pkcs11js`).
2. **Implement `HardwareKeyProvider`** — replace `NotImplementedError` throws in
   `generateKey`, `sign`, `encrypt`, `decrypt`, `deleteKey`, `listKeys`. Use
   AES-256-GCM for envelope ops and CSPRNG for IVs (CWE-327).
3. **Wire selection** — extend `createHardwareKeyStore()` to instantiate your
   provider when `KEY_PROVIDER` matches and `isAvailable()` is true. Remove the
   selector from `HARDWARE_PROVIDER_SELECTORS` fail-fast set once implemented.
4. **Test in isolation** — extend `src/__tests__/hardware-key-store.test.ts`
   with mocked native bindings; never require physical hardware in CI.
5. **Document operator setup** — add host prerequisites (TPM device permissions,
   HSM slot PIN, PKCS#11 library path) to `docs/deployment.md`.
6. **Optional CSFLE bridge** — to derive CSFLE data keys inside the HSM, wrap
   `CSFLEManager` key-version creation to call `getHardwareKeyStore().encrypt()`
   instead of `crypto.subtle.deriveKey`. This is a separate migration because it
   changes ciphertext layout and requires a re-encryption job.

The default template intentionally stays software-only so local dev and CI need no
special hardware.
