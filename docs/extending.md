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
     codeVerifier?: string
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

| Provider | Settings |
| --- | --- |
| AWS S3 | `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` |
| Cloudflare R2 / Backblaze B2 / MinIO / Wasabi | the above **plus** `BACKUP_S3_ENDPOINT` and `BACKUP_S3_FORCE_PATH_STYLE=true` |

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

## BFF / httpOnly cookie migration (fork hardening — not default)

The default template stores access and refresh tokens in `localStorage`
(`packages/ui/src/lib/auth.ts`) because the Next.js UI (`:3000`) and Hono API
(`:1337`) are separate origins. Any XSS payload can read those tokens. This is a
documented tradeoff — see [ADR 008](./adr/008-token-storage-design-revisit.md).

Forks that need stronger XSS resistance should adopt the **BFF
(Backend-for-Frontend)** pattern: a thin Next.js route handler proxies auth
requests, strips tokens from JSON responses, and sets httpOnly cookies instead.
The default template does **not** ship this path; follow the checklist below.

### When to adopt

- Your UI and API are **same-site** in production (or you control cookie
  `SameSite`/CORS/credentials end-to-end).
- XSS resistance matters more than direct browser→API SDK access.
- You accept the extra deploy surface (BFF proxy) and loss of user-token access
  from pure client-side SDK consumers (use API keys for those instead).

### Migration checklist

1. **Add a catch-all BFF route** — create
   `packages/ui/src/app/api/auth/[...path]/route.ts` that forwards auth
   requests to `NEXT_PUBLIC_ZEROTRUST_URL`, converts login/refresh JSON token
   pairs into `Set-Cookie` headers (`httpOnly`, `Secure`, `SameSite=Lax`), and
   strips tokens from the response body.
2. **Gate behind an env flag** — only mount the BFF when
   `NEXT_PUBLIC_BFF_AUTH=true` (document in `.env.example`). Default remains
   `localStorage`.
3. **Replace client token storage** — update `packages/ui/src/lib/auth.ts`:
   remove `localStorage` reads/writes; read the access token from a server-only
   cookie via `cookies()` in Server Components / route handlers, or expose a
   narrow `/api/auth/token` endpoint that returns only the short-lived access
   token (never the refresh token).
4. **Update `apiClient.ts`** — attach `Authorization` from the server-side
   cookie on BFF-proxied requests, or route all authenticated calls through the
   BFF so the browser never holds bearer tokens.
5. **Scope the refresh cookie** — path `/api/auth/token/refresh` only; access
   cookie path `/` with a short `max-age` matching the 1h access-token TTL.
6. **Verify zero `localStorage` leakage** — grep for `za_access_token` /
   `za_refresh_token` and confirm no references remain when BFF mode is on.
7. **Re-test OAuth/MFA flows** — magic links, OAuth callbacks, and MFA
   step-up must still land tokens in cookies, not redirect URLs (CWE-532).
8. **Document your fork** — note in your README that BFF mode is enabled and
   cross-origin SPA token access is no longer supported.

### Optional reference implementation

A minimal BFF skeleton (not shipped in the template):

```ts
// packages/ui/src/app/api/auth/[...path]/route.ts (fork-only)
import { type NextRequest, NextResponse } from "next/server";

const API = process.env.NEXT_PUBLIC_ZEROTRUST_URL ?? "http://localhost:1337";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const upstream = await fetch(`${API}/auth/${path.join("/")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await req.text(),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await upstream.json();
  if (body.accessToken) {
    const res = NextResponse.json({ user: body.user });
    res.cookies.set("za_access_token", body.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    });
    if (body.refreshToken) {
      res.cookies.set("za_refresh_token", body.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/api/auth/token/refresh",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return res;
  }
  return NextResponse.json(body, { status: upstream.status });
}
```

See ADR 008 Options B/C for the full tradeoff analysis and hybrid in-memory
variant.

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
