# Security Baseline — Expo (React Native) + Next.js + Hono SaaS Template

Scope: multi-tenant SaaS. Cookie-authenticated web client (Next.js), bearer-authenticated mobile client (Expo), Hono API on Bun, Postgres + Drizzle, VPS behind Coolify.

Priority order matters. §1–2 are structural — getting them wrong later means a rewrite. §3–6 are middleware and discipline. §7–9 are ops.

---

## 0. Three decisions that determine the template's security posture

**1. Tenant isolation is structural, not conventional.**
Broken object-level authorization (IDOR) is the #1 API vulnerability class (OWASP API Top 10 2023, API1). It happens because org filtering is a convention each handler must remember. Make it impossible to forget: tenant ID comes only from the session, the data layer requires it as a constructor argument, and Postgres RLS backstops it (§2).

**2. Token storage differs per client, and the lazy default is wrong on both.**
Web: httpOnly `__Host-` cookie — never localStorage. Mobile: refresh token in Keychain/Keystore via `expo-secure-store`, access token in memory — never AsyncStorage (§1).

**3. Next.js middleware is not an authorization boundary.**
CVE-2025-29927 (patched 14.2.25 / 15.2.3) let attackers skip middleware entirely with a spoofed `x-middleware-subrequest` header. Middleware is redirect UX. Authorization lives in every route handler, server action, and the data layer (§4).

---

## 1. Authentication

### Library

Use **Better Auth** unless there's a product reason not to: Drizzle adapter, mounts on Hono, Expo client plugin, and it already implements what people get wrong — refresh rotation with reuse detection, OAuth PKCE, CSRF origin checks, enumeration-resistant responses, per-endpoint rate limits. Hand-rolling auth in a template means maintaining all of that forever, and every consumer of the template inherits your mistakes. If you hand-roll anyway, the rest of this section is the spec.

### Passwords

```ts
// Bun ships argon2id natively. OWASP minimum params:
const hash = await Bun.password.hash(pw, {
  algorithm: "argon2id",
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
});
const ok = await Bun.password.verify(pw, hash);
```

- Enumeration resistance: identical body, status, and timing for "no such user" and "wrong password". Verify against a dummy hash when the user doesn't exist so timing doesn't leak.
- Reset tokens: single-use, ≤15 min expiry, stored hashed, response identical whether the email exists or not.
- Regenerate session ID on login (fixation).

### Web sessions (Next.js client)

```ts
setCookie(c, "__Host-session", sessionToken, {
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
  path: "/",
  // no Domain attribute — __Host- prefix enforces host-only
  maxAge: 60 * 60 * 24 * 30,
});
```

- Opaque server-side sessions (row in Postgres/Redis) beat stateless JWTs for a SaaS: instant revocation, session listing, no key-rotation ceremony. If you use JWTs anyway, ≤15 min TTL paired with server-side refresh.
- Logout = server-side revocation, not cookie deletion.

### Mobile sessions (Expo client)

```ts
import * as SecureStore from "expo-secure-store";

await SecureStore.setItemAsync("refresh", refreshToken, {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});
```

- Access token: memory only. Dies with the process — that's the point.
- Refresh token: SecureStore only. AsyncStorage is plaintext on disk.
- Rotation with family reuse detection:

```ts
// refresh_tokens: id, family_id, user_id, token_hash, expires_at, used_at
async function rotate(presented: string) {
  const t = await findByHash(sha256(presented));
  if (!t || t.expiresAt < now()) return null;
  if (t.usedAt) {
    // replay → assume theft
    await revokeFamily(t.familyId); // kills every descendant session
    return null;
  }
  await markUsed(t.id);
  return issuePair(t.userId, t.familyId); // new access + refresh, same family
}
```

- Store only the SHA-256 of refresh tokens. A DB dump must not yield live sessions.
- "Remember me" extends the refresh-family window, never the access-token TTL.

### Account lifecycle

- Email verification before privileged actions.
- TOTP/MFA columns in the schema from day one — retrofitting is painful.
- User-facing sessions table: list devices, revoke individually.

---

## 2. Authorization & tenant isolation

The failure mode: `GET /api/shifts/:id` fetches by ID and forgets the org filter. Every handler that "remembers" is a handler that can forget.

### Tenant ID comes from the session. Never from params, body, or headers.

```ts
app.use("/api/*", async (c, next) => {
  const session = await validateSession(c);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", session.userId);
  c.set("orgId", session.orgId);
  await next();
});
```

### Data layer requires the tenant — structurally

```ts
export function shiftsRepo(orgId: string) {
  return {
    list: () => db.select().from(shifts).where(eq(shifts.orgId, orgId)),
    byId: (id: string) =>
      db
        .select()
        .from(shifts)
        .where(and(eq(shifts.orgId, orgId), eq(shifts.id, id))),
    update: (id: string, patch: ShiftPatch) =>
      db
        .update(shifts)
        .set(patch)
        .where(and(eq(shifts.orgId, orgId), eq(shifts.id, id))),
  };
}
// handlers: shiftsRepo(c.get("orgId")).byId(id) — the filter can't be skipped
```

### Postgres RLS as defense in depth

```sql
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shifts
  USING (org_id = current_setting('app.org_id', true)::uuid);
```

```ts
await db.transaction(async (tx) => {
  // SET LOCAL can't take bind params — use set_config, third arg = tx-local
  await tx.execute(sql`SELECT set_config('app.org_id', ${orgId}, true)`);
  // queries here
});
```

`set_config(..., true)` is transaction-scoped — required behind pgbouncer in transaction mode. `current_setting(..., true)` returns NULL when unset, so an unscoped query fails closed. A repo-layer bug now returns zero rows instead of another tenant's payroll.

### Permissions

- One choke point: `assertCan(session, "shift:update", resource)`. No inline role checks scattered through handlers.
- Deny by default: new endpoints 403 until an explicit permission exists.
- IDs: UUIDv7 (app-side, or Postgres 18 `uuidv7()`). Non-sequential IDs are hygiene, not a control — authz is the control.

---

## 3. Hono API hardening

### Middleware stack, in order

```ts
import { secureHeaders } from "hono/secure-headers";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";

const app = new Hono<{ Variables: AuthVars }>();

app.use("*", requestId());
app.use("*", secureHeaders()); // nosniff, frame options, HSTS
app.use(
  "*",
  cors({
    origin: [env.APP_ORIGIN], // explicit allowlist
    credentials: true, // never with origin: "*"
  }),
);
app.use("*", csrf({ origin: env.APP_ORIGIN })); // origin check, form-type CSRF
app.use("*", bodyLimit({ maxSize: 1_048_576 }));
app.use("/api/*", rateLimit(globalBudget));
app.use("/api/auth/*", rateLimit(authBudget)); // much tighter
app.use("/api/*", authMiddleware); // §2
```

- Mobile clients send no `Origin` and carry no cookies — bearer auth makes them CSRF-immune. CSRF only concerns the cookie-authed web path.
- Strict CORS + `SameSite=Lax` + the origin check covers CSRF for JSON APIs: cross-origin JSON POSTs can't carry your cookie without passing preflight.

### Input validation

- `@hono/zod-validator` on every body, query, and param. Use the parsed output — never re-read `c.req.json()` after validating.
- Mass assignment: update schemas whitelist fields. Never spread a request body into `db.update().set()`.

```ts
const shiftPatch = z.object({
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  // orgId, id, createdBy deliberately absent — not client-writable
});
```

### Rate limiting

- Redis-backed (multi-instance safe). Tiers: global per-IP, per-user, and a separate aggressive tier for `/auth/*`.
- Progressive delay / CAPTCHA over hard account lockout — lockout is a DoS primitive against your own users.

### Errors and logging

```ts
app.onError((err, c) => {
  logger.error({ err, requestId: c.get("requestId") });
  if (err instanceof HTTPException) return err.getResponse();
  return c.json(
    { error: "internal_error", requestId: c.get("requestId") },
    500,
  );
});
```

- Stack traces and DB errors never reach the client; the request ID is the correlation handle.
- pino redaction from day one:

```ts
pino({
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.token",
      "*.tfn",
    ],
    censor: "[redacted]",
  },
});
```

### Webhooks

Raw body before parsing, or signature verification fails:

```ts
app.post("/webhooks/stripe", async (c) => {
  const raw = await c.req.text();
  const sig = c.req.header("stripe-signature");
  const event = stripe.webhooks.constructEvent(
    raw,
    sig!,
    env.STRIPE_WEBHOOK_SECRET,
  );
  // dedupe on event.id — webhooks retry
});
```

### Misc

- Idempotency keys on money-adjacent mutations.
- Timeouts + abort on all outbound fetches (Xero/MYOB exports included).
- File uploads, if in scope: magic-byte content sniffing, size caps, object storage with server-generated names, signed URLs — never serve from the app filesystem.

---

## 4. Next.js

### Authorization at the data layer, not middleware

CVE-2025-29927: a spoofed `x-middleware-subrequest` header skipped middleware entirely. Even on patched versions the lesson stands — middleware is a UX layer for redirects. Every route handler, server action, and data function re-authenticates:

```ts
"use server";
import "server-only";

export async function updateShift(input: unknown) {
  const session = await requireSession(); // throws → 401
  const data = shiftPatch.parse(input); // validate
  await assertCan(session, "shift:update", data.id);
  return shiftsRepo(session.orgId).update(data.id, data);
}
```

Server actions are public HTTP endpoints. The `<form>` that calls one is not an access control.

### Secrets

- Only `NEXT_PUBLIC_*` reaches the browser — audit that prefix in review.
- `import "server-only"` in every module touching secrets or the DB; the build fails if a client component imports it.

### XSS & redirects

- No `dangerouslySetInnerHTML` on anything user-influenced; DOMPurify if a rich-text feature forces it. React's escaping handles the rest — don't defeat it.
- CSP via headers: start report-only, then enforce.
- Validate `?redirect=` params against a path allowlist. Absolute URLs in redirect params are an open redirect.

---

## 5. Expo / React Native

- **Everything in the bundle is public.** JS is extractable from any IPA/APK. No API keys, no secrets, no "hidden" endpoints client-side — privileged calls go through the backend.
- Storage: §1. SecureStore for the refresh token, memory for the access token, AsyncStorage for nothing sensitive.
- OAuth: `expo-auth-session` — PKCE + system browser. Never a WebView (phishing surface; Google blocks it).
- Deep links are untrusted input: validate every param; auth callbacks verify `state`.
- EAS Update: enable code signing. OTA bundles are production code you're shipping.

### Deliberately skipped (and why)

- **Certificate pinning** — cert rotation bricks installed apps, Expo needs config plugins, and TLS + a locked-down API already covers this product tier's threat model. Revisit only for a specific adversary.
- **Root/jailbreak detection** — trivially bypassed (Frida hooks the detector) and false-positives paying customers.
- **JS obfuscation** — theater. The security model must survive full source disclosure of the client.

---

## 6. Database — Postgres + Drizzle

- Drizzle parameterizes `sql\`...\``template values. The injection surface is`sql.raw()`and string concatenation into identifiers. Grep for`sql.raw` in review; user input never reaches it.
- Two roles: `app` (DML only, no DDL, subject to `FORCE ROW LEVEL SECURITY`) and `migrator` (DDL, used only by the migration step in deploy).
- Backups: automated, encrypted, restore-tested. An untested backup is a hypothesis.
- Sensitive columns: for an AU workforce/payroll product, don't store TFNs unless the product genuinely requires it — the TFN Rule 2015 imposes specific handling obligations. If unavoidable: application-layer encryption, separate key, access audited.

---

## 7. Secrets & environment

Fail at boot, not at request time:

```ts
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().url(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
});

export const env = Env.parse(process.env);
```

- Secrets live in Coolify's environment store, per environment. `.env` never committed; `gitleaks` in CI catches the accident.
- Every secret has a documented rotation path. The first rotation should not happen during an incident.

---

## 8. Supply chain & CI

- Lockfile committed. Renovate/Dependabot on. `bun audit` (or osv-scanner) as a CI gate.
- Pin GitHub Actions by commit SHA, not tag.
- A template's dependency list is a liability shipped to every consumer — keep it minimal.

---

## 9. Ops — Vultr VPS + Coolify

- TLS everywhere; HSTS (preload once stable).
- Postgres and Redis bound to private interfaces / firewalled to the app only. `ufw` default-deny inbound except 80/443 + SSH. SSH keys only, no password auth.
- **Append-only audit log table**: logins, failed logins, role/permission changes, data exports, payroll runs. For a workforce platform this is both a control and a sellable feature.
- Australian Privacy Act applies to you as the platform. The employee-records exemption covers employers handling their own staff records — not a SaaS provider holding other companies' employee data. That means APP 11 (security of personal information) and the Notifiable Data Breaches scheme: write the breach-response runbook before you need it.

---

## 10. Review checklist (drop into PR template)

- [ ] Every new query goes through a tenant-scoped repo (or an RLS-covered table)
- [ ] Every new endpoint: zod-validated input, `assertCan` authz, rate-limit tier assigned
- [ ] No `sql.raw` with user input; no request body spread into `.set()`
- [ ] No new `NEXT_PUBLIC_*` var carrying anything sensitive
- [ ] Server actions authenticate + authorize internally
- [ ] New secrets added to the env schema + Coolify, never code
- [ ] New sensitive fields added to pino redact paths
- [ ] Mobile: nothing new in AsyncStorage that shouldn't be public
