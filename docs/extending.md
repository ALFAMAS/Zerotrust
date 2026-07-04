# Extending zerotrust

How to plug new third-party integrations into the platform. The architecture is
**env-first** (most providers switch via configuration, no code) and uses small
**adapter modules** where code is needed (OAuth). Every example below points at
the real file you touch.

> See also the **Customizing** section of the [README](../README.md) for
> renaming the app, adding an API route, custom org roles, and adding a locale.

---

## Add an OAuth provider

OAuth providers are adapters behind a factory, so adding one is two small files
of change plus env.

1. **Implement the adapter** — create `src/oauth/providers/<name>.ts` exporting
   an `exchangeCode` that returns the normalized shape the callback consumes
   (copy `google.ts`/`github.ts` as a template):

   ```ts
   // src/oauth/providers/<name>.ts
   import type { NormalizedProfile } from "../provider.factory";

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
   `getProviderAdapter()` in `src/oauth/provider.factory.ts` that dynamically
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
it in `src/mfa/`. Register the channel name in the settings model and UI.

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
