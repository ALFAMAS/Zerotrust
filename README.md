# ZeroAuth

A zero-trust authentication and authorization library for TypeScript applications. Built on PASETO v4, ABAC/RBAC, device attestation, and continuous access evaluation — designed to be embedded in any Node.js or Bun service as a secure auth layer.

---

## Table of Contents

- [Overview](#overview)
- [Feature Status](#feature-status)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Roadmap & TODO](#roadmap--todo)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

---

## Overview

ZeroAuth implements a full zero-trust security model where every request is verified, every device is tracked, and every access decision is evaluated at runtime — not just at login.

**Core principles:**

- **Never trust, always verify** — PASETO tokens are cryptographically bound to the originating device
- **Least privilege by default** — JIT privilege escalation with automatic expiry
- **Continuous evaluation** — risk scoring and ABAC enforcement on every request
- **Audit everything** — immutable forensic trail for all security-sensitive actions

**Runtime requirements:**

| Dependency | Version | Purpose |
|---|---|---|
| Node.js or Bun | 18+ / 1.0+ | Runtime |
| PostgreSQL | 15+ | Primary database (via Drizzle ORM) |
| Redis | 7.0+ | Distributed rate limiting |
| Elasticsearch | 8.0+ | Audit log storage *(optional)* |

---

## Feature Status

### Authentication

| Feature | Status | Notes |
|---|---|---|
| PASETO v4.local tokens | ✅ Complete | AES-256-GCM, no JWT confusion vulnerabilities |
| Session management | ✅ Complete | TTL, device binding, concurrent device limits |
| Proof-of-Possession | ✅ Complete | Cryptographic token-to-device binding |
| Passkeys / WebAuthn | ✅ Complete | Registration, authentication, credential management |
| TOTP (authenticator apps) | ✅ Complete | Setup, verify, disable, backup codes |
| Password hashing | ✅ Complete | bcryptjs, configurable rounds |
| OAuth 2.0 — GitHub | ✅ Complete | Provider adapter + callback routes |
| OAuth 2.0 — Google | ✅ Complete | Token exchange, profile fetch, PKCE |
| OAuth 2.0 — Facebook | ✅ Complete | Graph API profile fetch, app-scoped IDs |
| OAuth 2.0 — Apple | ✅ Complete | ID token decode, name claim, PKCE |
| MFA — Email OTP | ✅ Complete | Nodemailer |
| MFA — SMS OTP | ✅ Complete | Twilio |
| MFA — WhatsApp OTP | ✅ Complete | Twilio |
| MFA — Telegram OTP | ✅ Complete | Telegram Bot API |
| Passwordless (magic link) | ✅ Complete | Single-use token, 15-min TTL, anti-enumeration |
| Hardware security key attestation | ✅ Complete | FIDO2 attestation policy, AAGUID allow/deny lists |

### Authorization

| Feature | Status | Notes |
|---|---|---|
| RBAC with role hierarchy | ✅ Complete | Hierarchical permission inheritance |
| ABAC with dynamic conditions | ✅ Complete | Context-aware runtime evaluation |
| JIT privilege escalation | ✅ Complete | Temporal grants with auto-revocation |
| Continuous access evaluation | ✅ Complete | Risk scoring per request |
| Schedule-based access control | ✅ Complete | Timezone-aware window checks |
| Geo-fencing | ✅ Complete | Country allow-lists, subnet checks |

### Security Primitives

| Feature | Status | Notes |
|---|---|---|
| Client-Side Field Level Encryption | ✅ Complete | AES-256-GCM + HKDF key derivation |
| CSFLE key rotation | ✅ Complete | Versioned key management |
| Device fingerprinting | ✅ Complete | FNV-1a, anomaly detection |
| Device attestation middleware | ✅ Complete | Strict and permissive modes |
| Rate limiting — Redis (distributed) | ✅ Complete | Token bucket, namespaced keys |
| Rate limiting — in-memory | ✅ Complete | Token bucket with IP ban, exponential backoff |
| IP-based rate limiting | ✅ Complete | Sliding window counters |
| Rate limit audit events | ✅ Complete | All violations recorded to AuditLog |
| Security headers middleware | ✅ Complete | CSP, HSTS, X-Frame-Options, Referrer-Policy |
| Account lockout | ✅ Complete | N-attempt lock, notification, admin unlock |
| Max concurrent devices | ✅ Complete | Enforced at login, configurable per user |
| Refresh token rotation | ✅ Complete | Single-use enforced on every refresh |
| JTI single-use enforcement | ✅ Complete | Unique JTI on every issued token |
| Shared Signals Framework (receive) | ✅ Complete | SET validation and ingestion |
| Shared Signals Framework (send) | ✅ Complete | Transmit local compromise signals |
| Workload identity credentials | ✅ Complete | Short-lived scoped tokens |

### API Surface

| Feature | Status | Notes |
|---|---|---|
| Auth routes (register, login, refresh, logout) | ✅ Complete | `src/api/routes/auth.routes.ts` |
| OAuth routes (initiate, callback, state) | ✅ Complete | All 4 providers + PKCE + state/nonce |
| Session management routes | ✅ Complete | List, revoke single, revoke all |
| MFA enrollment/verification routes | ✅ Complete | TOTP, OTP channels, backup codes |
| Passkey / WebAuthn routes | ✅ Complete | Register options/response, authenticate, delete |
| Password reset routes | ✅ Complete | Request OTP, confirm with new password |
| SSF webhook endpoint | ✅ Complete | `POST /ssf/events` |
| Admin routes | ✅ Complete | Users, roles, sessions, JIT grants, audit logs |
| Workload credential routes | ✅ Complete | `src/api/routes/workload.routes.ts` |
| Magic link routes | ✅ Complete | `POST /auth/magic-link/send`, `GET|POST /auth/magic-link/verify` |
| OIDC provider routes | ✅ Complete | `/oidc/authorize`, `/oidc/token`, `/oidc/userinfo`, `/oidc/jwks` |
| SAML 2.0 SP routes | ✅ Complete | `/saml/login`, `/saml/acs`, `/saml/metadata` |
| Request validation schemas | ✅ Complete | Zod schemas for all endpoints |
| OpenAPI 3.1 spec | ✅ Complete | `src/api/openapi.json` — all routes documented |
| Swagger UI | ✅ Complete | Mounted at `/docs` in development |

### Observability

| Feature | Status | Notes |
|---|---|---|
| Structured JSON logging | ✅ Complete | Correlation IDs, ELK-ready |
| Audit log model | ✅ Complete | Schema with forensic fields |
| Elasticsearch audit pipeline | ✅ Complete | Bulk indexing, daily indices |
| ILM policy | ✅ Complete | Hot/warm/cold/delete lifecycle |
| Sensitive field masking | ✅ Complete | OTP codes, tokens redacted before shipping |
| Elasticsearch health check | ✅ Complete | Exposed at `/healthz` |
| Kibana dashboards | ✅ Complete | 6 `.ndjson` dashboards in `kibana/` directory |

### Testing

| Feature | Status | Notes |
|---|---|---|
| TokenService unit tests | ✅ Complete | Issue, verify, expiry, tamper, PoP |
| AuthorizationEngine unit tests | ✅ Complete | ABAC conditions, role hierarchy, JIT lifecycle |
| CSFLE unit tests | ✅ Complete | Encrypt/decrypt round-trip, key rotation |
| MFA channel unit tests | ✅ Complete | Email, SMS, WhatsApp, Telegram (mocked) |
| OAuth adapter unit tests | ✅ Complete | GitHub, Google, Facebook, Apple (mocked) |
| Integration tests | ✅ Complete | Token flow, rate limiter, CSFLE |
| Middleware integration tests | ✅ Complete | Rate limit, lockout, geo-fence, security headers, audit |
| Test coverage gate | ✅ Complete | ≥ 80% lines/functions/statements enforced in CI |
| Load tests | ✅ Complete | k6 scripts: login storm, refresh storm, session revocation |
| Chaos tests | ✅ Complete | Graceful degradation when Redis/ES unavailable |

### CI/CD

| Feature | Status | Notes |
|---|---|---|
| GitHub Actions workflow | ✅ Complete | lint → type-check → test → build |
| Coverage report as PR comment | ✅ Complete | Posted automatically on every PR |
| Dependency audit | ✅ Complete | `npm audit --audit-level=high` on every push |
| Docker image build | ✅ Complete | Built and cached on merge to main |
| Semantic release | ✅ Complete | `.releaserc.json` + commitlint + auto-CHANGELOG |

### Developer Experience

| Feature | Status | Notes |
|---|---|---|
| Pre-commit hooks | ✅ Complete | Prettier + ESLint via Husky + lint-staged |
| VS Code debugger | ✅ Complete | `.vscode/launch.json` — bun, tsx, and test configs |
| CLI scaffold tool | ✅ Complete | `npx zeroauth init` — `packages/cli/` |
| Commit-message linting | ✅ Complete | commitlint + conventional commits |

---

## Quick Start

### Docker (Recommended)

```bash
git clone https://github.com/alfamas/zeroauth
cd zeroauth
cp .env.example .env
# Edit .env with your secrets

docker-compose up -d
docker-compose ps
docker-compose logs -f zeroauth
```

Services:

| Service | URL |
|---|---|
| ZeroAuth API | `http://localhost:3000` |
| Swagger UI | `http://localhost:3000/docs` |
| PostgreSQL | `postgresql://zeroauth:password@localhost:5432/zeroauth` |
| Redis | `redis://localhost:6379` |
| Elasticsearch | `http://localhost:9200` |
| Kibana | `http://localhost:5601` |

### Local Development

```bash
bun install        # or: npm install
cp .env.example .env

bun run dev        # tsx watch — hot reload
bun run test       # vitest
bun run test:coverage  # coverage report (v8, ≥80% gate)
bun run type-check # tsc --noEmit
bun run lint
bun run format
```

### Embed in Your Application

```typescript
import { initializeZeroAuth, shutdownZeroAuth } from "@zeroauth/core";

const { config, logger } = await initializeZeroAuth();

// On process exit
process.on("SIGTERM", () => shutdownZeroAuth());
```

---

## Packages

ZeroAuth is organized as a monorepo with multiple packages:

| Package | Path | Description |
|---------|------|-------------|
| `@zeroauth/core` | `./` | Core auth library (Hono API, PostgreSQL/Drizzle ORM, services) |
| `@zeroauth/cli` | `packages/cli/` | `npx zeroauth init` scaffold CLI |
| `@zeroauth/sdk` | `packages/sdk/` | Typed JS/TS client for consuming ZeroAuth |
| `@zeroauth/react` | `packages/react/` | React hooks + context provider built on `@zeroauth/sdk` |
| `@zeroauth/admin-ui` | `packages/admin-ui/` | Next.js admin dashboard (port 3001) |
| `@zeroauth/ui` | `packages/ui/` | Next.js user-facing app (port 3002) |

### CLI Quick Start

```bash
# Initialize a new project
npx @zeroauth/cli init my-app
cd my-app
docker compose up -d
```

### SDK Quick Start

```typescript
import { ZeroAuthClient } from "@zeroauth/sdk";

const auth = new ZeroAuthClient({
  baseUrl: "https://auth.example.com",
  tokenStorage: "localStorage",       // or "memory" (SSR) or "cookie"
  onRefreshFailed: () => router.push("/login"),
});

// Register
await auth.register("user@example.com", "password123", "Alice");

// Login
await auth.login("user@example.com", "password123");

// Magic link
await auth.sendMagicLink("user@example.com");

// Passkey
const options = await auth.getPasskeyRegistrationOptions();
// ... call @simplewebauthn/browser startRegistration(options)
await auth.registerPasskey(credential);
```

### OIDC Provider Configuration

```typescript
import { registerOIDCClient } from "@zeroauth/core";

registerOIDCClient({
  clientId: "my-frontend-app",
  redirectUris: ["https://app.example.com/callback"],
  scopes: ["openid", "profile", "email"],
  pkceRequired: true,
  name: "My Frontend App",
});
```

Discovery document: `GET /.well-known/openid-configuration`

### SAML 2.0 Configuration

```env
SAML_SP_ENTITY_ID=https://auth.example.com/saml/metadata
SAML_ACS_URL=https://auth.example.com/saml/acs
SAML_IDP_ENTITY_ID=https://sts.windows.net/<tenant-id>/
SAML_IDP_SSO_URL=https://login.microsoftonline.com/<tenant-id>/saml2
SAML_IDP_CERT=<base64-cert>
```

SP-initiated login: `GET /saml/login?redirect=/dashboard`
SP metadata: `GET /saml/metadata`

### Multi-Tenant

```typescript
import { resolveTenant, requireTenant } from "@zeroauth/core";

// Resolve tenant from X-Tenant-ID header, subdomain, or query param
app.use("*", resolveTenant());

// Protect tenant-scoped routes
app.get("/api/data", requireTenant, (c) => {
  const tenantId = c.get("tenantId"); // set by resolveTenant()
  return c.json({ tenantId });
});
```

### Hardware Attestation

```typescript
import { verifyAttestation, HIGH_ASSURANCE_POLICY } from "@zeroauth/core";

const result = verifyAttestation(
  { fmt: "packed", aaguid: "cb69481e-8ff7-4039-93ec-0a2729a154a8", userVerified: true },
  HIGH_ASSURANCE_POLICY
);

if (!result.passed) throw new Error(result.reason);
// result.authenticatorName → "YubiKey 5 Series"
```

Environment override: `ATTESTATION_LEVEL=direct ATTESTATION_HIGH_ASSURANCE=true`

### React Quick Start

```tsx
import { ZeroAuthProvider, useAuth, AuthGuard } from "@zeroauth/react";

// Wrap your app
export default function App() {
  return (
    <ZeroAuthProvider baseUrl="https://auth.example.com" tokenStorage="localStorage">
      <AuthGuard fallback={<LoginPage />}>
        <Dashboard />
      </AuthGuard>
    </ZeroAuthProvider>
  );
}

// Use hooks anywhere inside the provider
function Dashboard() {
  const { user, logout } = useAuth();
  return <button onClick={logout}>Sign out {user?.email}</button>;
}
```

Available hooks: `useAuth`, `useSession`, `useMFA`, `usePasskey`, `useMagicLink`  
Available components: `AuthGuard`, `withAuth` HOC

### SCIM 2.0 Provisioning

Enable automatic user provisioning from Azure AD, Okta, or any SCIM-compatible IdP:

```bash
# Set the shared secret
SCIM_API_TOKEN=your-secret-token

# Point your IdP at:
# Base URL:    https://auth.example.com/scim/v2
# Auth method: Bearer token
```

Supported: create, update, deactivate users; create/manage groups (maps to ZeroAuth roles).

### Prometheus Metrics

```bash
# Scrape endpoint (no auth required — firewall at the load balancer level)
curl https://auth.example.com/metrics
```

Configure in Prometheus:
```yaml
scrape_configs:
  - job_name: zeroauth
    static_configs:
      - targets: ["auth.example.com:443"]
    scheme: https
    metrics_path: /metrics
```

### OpenTelemetry

```bash
# Environment variables
OTEL_ENABLED=true
OTEL_SERVICE_NAME=zeroauth
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
```

---

## Project Structure

```
.
├── packages/
│   ├── cli/                 # @zeroauth/cli — npx zeroauth init
│   ├── sdk/                 # @zeroauth/sdk — typed JS/TS client
│   ├── react/               # @zeroauth/react — React hooks + context provider
│   ├── admin-ui/            # @zeroauth/admin-ui — Next.js admin (port 3001)
│   └── ui/                  # @zeroauth/ui — Next.js user app (port 3002)
├── kibana/                  # Kibana saved object exports (.ndjson)
├── src/
├── config/                  # Environment config loader + validation
├── crypto/
│   └── csfle.ts             # AES-256-GCM field encryption, HKDF key derivation
├── db/
│   ├── index.ts             # PostgreSQL connection via Drizzle ORM, health checks, pooling
│   └── schema.ts            # Drizzle table definitions (users, sessions, roles, JIT, audit…)
├── logger/                  # Structured JSON logging, correlation IDs, ES stream
├── shared/
│   └── types.ts             # Canonical type definitions (User, Session, Token…)
├── models/
│   ├── settings.model.ts    # SaaS settings (feature flags, app config)
│   ├── tenant.model.ts      # Tenant schema (slug, plan, OIDC/SAML config)
│   └── index.ts             # Re-exports Drizzle tables as *Model aliases
├── services/
│   ├── token.service.ts     # PASETO v4.local token issue/verify
│   ├── authz.service.ts     # ABAC engine, role hierarchy, JIT evaluation
│   ├── fingerprint.service.ts
│   ├── magicLink.service.ts # Send + verify single-use passwordless tokens
│   └── rateLimiter/
│       ├── redis.ts         # Redis token bucket rate limiter
│       └── inmemory.ts      # In-memory token bucket with IP ban
├── middleware/
│   ├── auth.ts              # Token verification, session hydration
│   ├── deviceAttestation.ts # Fingerprint comparison, anomaly flagging
│   ├── continuousEval.ts    # Per-request risk scoring + ABAC enforcement
│   ├── rateLimiting.ts      # Multi-layer + per-tenant rate limiting + audit events
│   ├── geoFencing.ts        # Country/subnet access control
│   ├── temporalAccess.ts    # Schedule-based restrictions, JIT expiry
│   ├── proofOfPossession.ts # Nonce-based token-to-device binding
│   ├── sessionControl.ts    # Concurrent device limits, session revocation
│   ├── accountLockout.ts    # Failed login tracking, lockout enforcement
│   ├── validation.ts        # Zod schema validation, consistent error envelope
│   ├── securityHeaders.ts   # CSP, HSTS, X-Frame-Options, Referrer-Policy
│   ├── mtls.ts              # Client certificate auth, SPIFFE workload identity
│   └── tenant.ts            # X-Tenant-ID / subdomain resolution, requireTenant
├── api/
│   ├── server.ts            # Hono app factory
│   ├── openapi.json         # OpenAPI 3.1 specification (all routes)
│   ├── auth/index.ts        # Auth request handlers
│   ├── schemas/             # Zod schemas: auth, session, mfa, admin
│   └── routes/
│       ├── auth.routes.ts        # Register, login, refresh, logout, OAuth
│       ├── session.routes.ts     # List, revoke, revoke-all
│       ├── mfa.routes.ts         # TOTP, OTP channels, backup codes
│       ├── passkey.routes.ts     # WebAuthn register + authenticate
│       ├── password-reset.routes.ts
│       ├── admin.routes.ts       # Users, roles, sessions, JIT, audit logs
│       ├── workload.routes.ts
│       └── magic-link.routes.ts  # POST /auth/magic-link/send, GET|POST /verify
├── oidc/
│   ├── provider.ts          # OIDC client registry, code exchange, userinfo
│   └── routes.ts            # Discovery, authorize, token, userinfo, logout
├── saml/
│   ├── sp.ts                # SP-initiated AuthnRequest, assertion parsing, metadata
│   └── routes.ts            # /saml/login, /saml/acs, /saml/metadata
├── oauth/
│   ├── provider.factory.ts  # Provider-agnostic adapter interface
│   └── providers/
│       ├── github.ts        # GitHub OAuth adapter
│       ├── google.ts        # Google OAuth adapter
│       ├── facebook.ts      # Facebook Graph API adapter
│       └── apple.ts         # Apple Sign In adapter
├── mfa/
│   ├── index.ts             # OTP dispatch
│   ├── attestation.ts       # FIDO2 attestation policy + AAGUID database
│   ├── attestation-ca-pin.ts# Per-deployment CA trust anchor pinning
│   ├── fido-mds3.ts         # FIDO Alliance MDS3 real-time AAGUID lookups
│   ├── resident-keys.ts     # Discoverable credential / usernameless auth flow
│   └── channels/            # email | sms | whatsapp | telegram
├── ssf/
│   ├── receiver.ts          # Ingest SET payloads, trigger revocations
│   ├── sender.ts            # Transmit local security events
│   └── verify.ts            # SET signature validation
├── webhooks/
│   ├── types.ts             # WebhookEndpoint, WebhookDelivery, event types
│   ├── store.ts             # In-memory endpoint registry (singleton)
│   ├── delivery.ts          # HMAC-signed delivery, exponential backoff retry
│   ├── routes.ts            # /admin/webhooks CRUD + test ping
│   └── index.ts
├── metrics/
│   ├── registry.ts          # prom-client Registry
│   ├── counters.ts          # Auth, MFA, rate limit, anomaly, webhook counters/histograms
│   ├── middleware.ts        # requestDurationSeconds histogram + /metrics route handler
│   └── index.ts
├── telemetry/
│   ├── tracer.ts            # OpenTelemetry SDK init, OTLP exporter, withSpan helper
│   ├── middleware.ts        # X-Trace-Id injection middleware
│   └── index.ts
├── scim/
│   ├── types.ts             # SCIMUser, SCIMGroup, SCIMListResponse, SCIMError
│   ├── utils.ts             # userToSCIM, scimToUserFields, parseSCIMFilter
│   ├── routes.ts            # /scim/v2 — Users + Groups CRUD (RFC 7644)
│   └── index.ts
├── workload/
│   └── index.ts             # Short-lived workload credential issuance
├── audit/
│   └── index.ts             # Elasticsearch bulk pipeline, ILM, field masking
└── __tests__/
    ├── fingerprint.test.ts
    ├── token.service.test.ts
    ├── authz.service.test.ts
    ├── csfle.test.ts
    ├── mfa.test.ts
    ├── oauth.test.ts
    ├── middleware.test.ts    # Rate limit, lockout, geo-fence, security headers
    └── integration.test.ts

tests/
└── load/
    ├── login.k6.js              # 1000 concurrent login + refresh storm
    ├── session-revocation.k6.js # Session revocation cascade
    └── chaos.k6.js              # Graceful degradation under dependency failure
```

---

## Configuration

All configuration is environment-based. Copy `.env.example` and fill in values.

### Database

```env
DATABASE_URL=postgresql://zeroauth:password@localhost:5432/zeroauth
DB_POOL_SIZE=10
```

### Critical Keys

Generate with:

```bash
openssl rand -hex 32
```

```env
TOKEN_SECRET_HEX=<32-byte random hex>
CSFLE_MASTER_KEY_HEX=<32-byte random hex>
```

### OAuth Setup

```env
OAUTH_GITHUB_CLIENT_ID=your-client-id
OAUTH_GITHUB_CLIENT_SECRET=your-client-secret
OAUTH_GITHUB_REDIRECT_URI=http://localhost:3000/auth/oauth/github/callback

OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=
OAUTH_GOOGLE_REDIRECT_URI=http://localhost:3000/auth/oauth/google/callback

OAUTH_FACEBOOK_CLIENT_ID=
OAUTH_FACEBOOK_CLIENT_SECRET=
OAUTH_FACEBOOK_REDIRECT_URI=http://localhost:3000/auth/oauth/facebook/callback

OAUTH_APPLE_CLIENT_ID=
OAUTH_APPLE_CLIENT_SECRET=
OAUTH_APPLE_REDIRECT_URI=http://localhost:3000/auth/oauth/apple/callback

# Comma-separated list of allowed OAuth redirect URIs
OAUTH_ALLOWED_REDIRECT_URIS=http://localhost:3000/auth/oauth/github/callback,...
```

### MFA Channels

```env
MFA_EMAIL_ENABLED=true
MFA_SMS_ENABLED=false
MFA_WHATSAPP_ENABLED=false
MFA_TELEGRAM_ENABLED=false
```

### WebAuthn (Passkeys)

```env
RP_ID=localhost
RP_NAME=ZeroAuth
RP_ORIGIN=http://localhost:3000
```

### Account Lockout

```env
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_WINDOW_MS=900000    # 15 minutes
LOCKOUT_DURATION_MS=1800000 # 30 minutes
```

---

## Architecture

### Request Lifecycle

```
Incoming Request
      │
      ▼
┌─────────────────────────┐
│  Rate Limiting Layer    │  In-memory (fast) → Redis (distributed) → IP ban
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│  Security Headers       │  CSP, HSTS, X-Frame-Options, Referrer-Policy
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│  Auth Middleware        │  PASETO verify → session hydrate → PoP validate
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│  Device Attestation     │  Fingerprint diff → anomaly flag → step-up
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│  Continuous Eval        │  ABAC conditions → risk score → allow/deny/challenge
└─────────────┬───────────┘
              │
              ▼
┌─────────────────────────┐
│  Geo + Temporal Guards  │  Country check → schedule window → JIT expiry
└─────────────┬───────────┘
              │
              ▼
         Route Handler
              │
              ▼
         Audit Log  ──────────────────────► Elasticsearch (async)
```

### Token Architecture

```
Login Success
      │
      ▼
TokenService.issue()
  ├── PASETO v4.local (AES-256-GCM)
  ├── Payload: userId, sessionId, roles, deviceId, jti (unique)
  ├── Cryptographic binding (PoP nonce)
  └── 15-min access token + rotating refresh token (single-use)

Per Request
  ├── PASETO verify
  ├── JTI uniqueness check
  ├── PoP nonce check
  ├── Session.lastActivityAt update
  └── Attach req.user + req.session + req.token
```

### CSFLE Field Encryption

Sensitive fields are encrypted at the application layer before writing to PostgreSQL via Drizzle:

- `email`, `phone`, `passwordHash`
- `totp.secret`, OAuth access/refresh tokens
- Custom `encryptedAttributes` map

Encryption: AES-256-GCM with HKDF-derived per-field keys. Key version stored alongside ciphertext for seamless rotation.

---

## API Reference

Full OpenAPI 3.1 spec is at `src/api/openapi.json` and served as Swagger UI at `/docs`.

### Auth (`/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Create account |
| POST | `/auth/login` | — | Password login |
| POST | `/auth/token/refresh` | — | Rotate access token (refresh token required) |
| POST | `/auth/logout` | Bearer | Revoke current session |
| POST | `/auth/logout/all` | Bearer | Revoke all sessions |

### OAuth (`/auth/oauth`)

| Method | Path | Description |
|---|---|---|
| POST | `/auth/oauth/state` | Generate state + nonce for PKCE flow |
| GET | `/auth/oauth/:provider` | Redirect to provider authorization URL |
| GET | `/auth/oauth/:provider/callback` | Authorization code exchange |

### Passkeys (`/auth/passkey`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/passkey/register/options` | Bearer | Get WebAuthn registration options |
| POST | `/auth/passkey/register` | Bearer | Complete registration |
| POST | `/auth/passkey/authenticate/options` | — | Get authentication options |
| POST | `/auth/passkey/authenticate` | — | Complete authentication |
| DELETE | `/auth/passkey/:credentialId` | Bearer | Remove passkey |

### MFA (`/auth/mfa`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/mfa/totp/setup` | Bearer | Initialize TOTP (returns secret + QR) |
| POST | `/auth/mfa/totp/verify` | Bearer | Activate TOTP + get backup codes |
| POST | `/auth/mfa/totp/disable` | Bearer | Disable TOTP |
| POST | `/auth/mfa/backup-codes/regenerate` | Bearer | Regenerate backup codes |
| POST | `/auth/mfa/backup-codes/redeem` | — | Redeem a backup code |
| POST | `/auth/mfa/otp/send` | Bearer | Send OTP via email/SMS/WhatsApp/Telegram |
| POST | `/auth/mfa/otp/verify` | Bearer | Verify channel OTP |

### Password Reset (`/auth/password-reset`)

| Method | Path | Description |
|---|---|---|
| POST | `/auth/password-reset/request` | Send reset OTP |
| POST | `/auth/password-reset/confirm` | Apply new password |

### Sessions (`/sessions`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/sessions` | Bearer | List sessions |
| DELETE | `/sessions/:id` | Bearer | Revoke session |
| DELETE | `/sessions` | Bearer | Revoke all other sessions |

### Workload (`/workload`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/workload/credentials` | Bearer | Issue scoped workload token |
| POST | `/workload/validate` | — | Validate workload token |

### Admin (`/admin`) — requires `admin` role

| Method | Path | Description |
|---|---|---|
| GET/PATCH/DELETE | `/admin/users` / `/admin/users/:id` | User management |
| POST/DELETE | `/admin/users/:id/roles` / `/admin/users/:id/roles/:name` | Role assignment |
| GET/DELETE | `/admin/users/:id/sessions` | User session management |
| DELETE | `/admin/sessions/:id` | Revoke any session |
| GET/POST | `/admin/roles` | Role management |
| GET | `/admin/jit-grants` | List JIT grants |
| POST | `/admin/jit-grants/:id/approve` | Approve JIT request |
| POST | `/admin/jit-grants/:id/deny` | Deny JIT request |
| DELETE | `/admin/jit-grants/:id` | Revoke JIT grant |
| GET | `/admin/audit-logs` | Query audit log |

### Shared Signals (`/ssf`)

| Method | Path | Description |
|---|---|---|
| POST | `/ssf/events` | Receive Security Event Tokens (SET) |

---

## Testing

```bash
bun run test              # run all tests (vitest)
bun run test:watch        # watch mode
bun run test:coverage     # coverage report (v8) — ≥80% gate enforced

# Run a specific file
bun run test src/__tests__/fingerprint.test.ts

# Load tests (requires k6)
k6 run tests/load/login.k6.js -e BASE_URL=http://localhost:3000
k6 run tests/load/session-revocation.k6.js -e BASE_URL=http://localhost:3000 -e ADMIN_TOKEN=<token>
k6 run tests/load/chaos.k6.js -e BASE_URL=http://localhost:3000
```

**Test coverage:** ≥ 80% lines, functions, and statements enforced via `vitest.config.ts` thresholds.

**Test matrix:**

| Suite | File | What it covers |
|---|---|---|
| Fingerprint | `fingerprint.test.ts` | FNV-1a hashing, anomaly detection |
| Token Service | `token.service.test.ts` | PASETO issue, verify, expiry, JTI, PoP |
| Authorization Engine | `authz.service.test.ts` | ABAC conditions, role hierarchy, JIT |
| CSFLE | `csfle.test.ts` | Encrypt/decrypt, key rotation, schema hooks |
| MFA Channels | `mfa.test.ts` | Email, SMS, WhatsApp, Telegram (mocked) |
| OAuth Adapters | `oauth.test.ts` | All 4 providers (mocked) |
| Middleware | `middleware.test.ts` | Rate limit, lockout, geo-fence, security headers, audit |
| Integration | `integration.test.ts` | Auth flow, rate limiter, CSFLE end-to-end |

---

## Deployment

### Docker Compose

```bash
docker-compose up -d
docker-compose logs -f zeroauth
docker-compose exec mongodb mongosh -u admin -p password
docker-compose exec redis redis-cli ping
```

### Production Checklist

- [ ] Replace default PostgreSQL/Redis passwords in `docker-compose.yml`
- [ ] Set `NODE_ENV=production`
- [ ] Set `DATABASE_URL` to your production PostgreSQL connection string
- [ ] Run database migrations: `npx drizzle-kit push` (or apply `drizzle/` migration files)
- [ ] Configure TLS termination (nginx/Caddy in front of port 3000)
- [ ] Set `ELASTICSEARCH_URL` for audit log shipping
- [ ] Enable `CSFLE_KEY_ROTATION_DAYS` for key rotation schedule
- [ ] Restrict Elasticsearch access to internal network only
- [ ] Set Redis `requirepass` and update `REDIS_URI`
- [ ] Configure log retention policy in Elasticsearch ILM
- [ ] Set `OAUTH_ALLOWED_REDIRECT_URIS` to your production domains only
- [ ] Set `RP_ID`, `RP_NAME`, `RP_ORIGIN` for WebAuthn

---

## Security

### Best Practices

1. Never commit `.env` — use `.env.example` as the template only
2. Rotate `TOKEN_SECRET_HEX` and `CSFLE_MASTER_KEY_HEX` on schedule using `CSFLE_KEY_ROTATION_DAYS`
3. Enforce HTTPS at the load balancer — ZeroAuth runs plain HTTP internally
4. Subscribe to provider SSF streams (Google, GitHub) so account compromise triggers automatic session revocation
5. Run `npm audit` or `bun audit` in CI on every push (already in GitHub Actions)
6. Review Kibana audit dashboards for anomaly spikes before each release
7. Enforce `OAUTH_ALLOWED_REDIRECT_URIS` in production — open redirectors are an OAuth vulnerability

### Vulnerability Reporting

Send security issues to: **mas.arafat.dev@gmail.com**

Do not open public GitHub issues for vulnerabilities.

---

## Roadmap & TODO

Items are grouped by category. All v1 features are complete. Items below are v2 targets.

### ✅ Completed in v1.1

| Item | Description | Location |
|------|-------------|----------|
| **Kibana dashboards** | 6 `.ndjson` dashboards: auth rates, MFA adoption, denial patterns, rate-limit heatmap, device anomalies, overview | `kibana/` |
| **Semantic release** | `@semantic-release/changelog` + conventional commits, auto-CHANGELOG, commitlint | `.releaserc.json`, `commitlint.config.js` |
| **CLI tool** | `npx zeroauth init` — interactive wizard, key generation, Docker Compose scaffold | `packages/cli/` |
| **SDK client** | Typed fetch wrapper for all ZeroAuth API endpoints; isomorphic (browser + Node.js) | `packages/sdk/` |
| **Admin UI** | Next.js 14 admin dashboard — users, sessions, audit logs, JIT approvals, role management | `packages/admin-ui/` |
| **User-facing UI** | Next.js 14 app — landing page, login, register, magic link, user dashboard | `packages/ui/` |
| **Passwordless magic links** | Single-use email tokens, 15-min TTL, anti-user-enumeration response | `src/services/magicLink.service.ts` |
| **Hardware attestation** | FIDO2 attestation policy engine, AAGUID allow/deny lists, known HW key database | `src/mfa/attestation.ts` |
| **Multi-tenant middleware** | Tenant resolution (header/subdomain/query), `TenantModel`, `resolveTenant()` middleware | `src/middleware/tenant.ts`, `src/models/tenant.model.ts` |
| **OIDC provider** | RFC 6749 + OIDC Core 1.0 — discovery, authorize, token, userinfo, logout endpoints | `src/oidc/` |
| **SAML 2.0 SP** | SP-initiated SSO, ACS handler, SP metadata, relay-state CSRF protection | `src/saml/` |

### ✅ Completed in v3

| Feature | Description | Location |
|---------|-------------|----------|
| **Cross-tenant JIT** | In-memory store for cross-tenant privilege requests with approve/deny + auto-expiry | `src/jit/` |
| **LDAP/Active Directory** | LDAPClient with bind, authenticate, search, sync; schedulable incremental sync | `src/ldap/` |
| **Slack/Teams notifications** | Slack Block Kit + Teams Adaptive Cards + PagerDuty Events API v2; env-var init | `src/notifications/` |
| **Token binding** | Ties tokens to TLS sessions via tbh claim; strict/relaxed modes; proxy header support | `src/middleware/tokenBinding.ts` |
| **Hardware-backed key storage** | Provider interface with TPM2/Secure Enclave/PKCS#11 stubs + Software fallback (HKDF+AES-GCM) | `src/crypto/hardware-key-store.ts` |
| **FIDO2 enterprise attestation** | CA-signed attestation for device fleets; X.509 chain verification; OU/serial restrictions | `src/mfa/enterprise-attestation.ts` |
| **VS Code extension** | `.zeroauth` syntax highlighting, snippets (full config + 7 sections), secret detection diagnostics | `packages/vscode-extension/` |
| **Terraform provider** | Go Terraform Plugin Framework provider: `zeroauth_tenant`, `zeroauth_role`, `zeroauth_webhook` resources | `packages/terraform-provider/` |
| **Decentralized identity (DID)** | W3C DID resolution (did:key, did:web), challenge-response auth, user provisioning | `src/did/` |
| **Post-quantum cryptography** | ML-KEM-768 interface with SimulatedMLKEM (ECDH-P256) + NobleMLKEM stub; hybrid AES-GCM encryption | `src/crypto/post-quantum.ts` |
| **Edge deployment** | Cloudflare Workers worker: token verify/issue, KV session store, rate limiting via KV | `packages/edge/` |

### ✅ Completed in v2

| Feature | Description | Location |
|---------|-------------|----------|
| **FIDO MDS3 integration** | Real-time AAGUID certification lookups with 24h cache; enriches attestation results | `src/mfa/fido-mds3.ts` |
| **Multi-tenant rate limiting** | Per-tenant quota namespaces with `tenantRateLimit()` and `configureTenantQuota()` | `src/middleware/rateLimiting.ts` |
| **Tenant provisioning API** | REST CRUD at `/admin/tenants`; plan management, OIDC + SAML SSO config per tenant | `src/api/routes/tenant.routes.ts` |
| **SCIM 2.0** | Full RFC 7644 at `/scim/v2`; Users + Groups CRUD, filter, PATCH ops, Bearer auth | `src/scim/` |
| **FIDO2 resident keys** | Discoverable credential registration and usernameless authentication flow | `src/mfa/resident-keys.ts` |
| **Attestation CA pinning** | Per-deployment trust anchor pinning with AAGUID allow-lists | `src/mfa/attestation-ca-pin.ts` |
| **Mutual TLS (mTLS)** | Client certificate auth with proxy header support (X-Client-Cert-CN, Envoy XFCC) | `src/middleware/mtls.ts` |
| **Webhook delivery** | HMAC-SHA256 signed events, exponential backoff retry, CRUD at `/admin/webhooks` | `src/webhooks/` |
| **Prometheus metrics** | prom-client counters/histograms/gauges for auth flows; scrape at `/metrics` | `src/metrics/` |
| **OpenTelemetry tracing** | OTLP export, auto-instrumentation, `X-Trace-Id` on responses | `src/telemetry/` |
| **`@zeroauth/react`** | `ZeroAuthProvider`, `useAuth`, `useSession`, `useMFA`, `usePasskey`, `useMagicLink`, `AuthGuard` | `packages/react/` |

### ✅ Completed in v4

| Feature | Description | Location |
|---------|-------------|----------|
| **Cross-tenant federation** | RFC 8693 token exchange — trust external ZeroAuth deployments; admin-managed provider registry; `POST /federation/token-exchange`, `GET /federation/discovery` | `src/federation/` |
| **Biometric continuous auth** | Mid-session re-verification via passkey assertion, TOTP, or OTP; risk-factor assessment (idle time, location/device change, anomaly score); `POST /auth/verify/challenge`, `POST /auth/verify/respond` | `src/middleware/continuousVerification.ts`, `src/services/sessionRisk.service.ts`, `src/api/routes/verification.routes.ts` |
| **AI-powered anomaly detection** | Welford online algorithm for per-user behavioral baselines (login hour, known IPs/countries/devices); z-score anomaly scoring; hard-block at 95% confidence; admin baseline management at `/admin/anomaly/*` | `src/services/anomalyDetection.service.ts`, `src/middleware/anomalyMiddleware.ts` |

### Future

- No remaining items — all roadmap features are complete.

---

## Contributing

1. Work in TypeScript strict mode — no `any`, no disabled lint rules without comment explaining why
2. Every new module needs at least one test file
3. Security-sensitive changes require a description of the threat model in the PR body
4. Run `bun run lint && bun run format && bun run type-check` before opening a PR
5. Update `CHANGELOG.md` under `[Unreleased]` for any user-visible change
6. Load test new endpoints before marking them complete — confirm they meet the `p(95)<500ms` threshold

---

## Troubleshooting

### PostgreSQL connection errors

```bash
docker-compose logs postgres
docker-compose exec postgres psql -U zeroauth -d zeroauth
```

Check `DATABASE_URL` in `.env` — it must match the container name:
```
DATABASE_URL=postgresql://zeroauth:password@postgres:5432/zeroauth
```

### Database migrations

```bash
# Push schema changes to the database (development)
npx drizzle-kit push

# Generate SQL migration files
npx drizzle-kit generate

# Apply migrations (production)
npx drizzle-kit migrate
```

### CSFLE key errors

```bash
# Regenerate keys (do not reuse old values in production)
openssl rand -hex 32  # paste into TOKEN_SECRET_HEX
openssl rand -hex 32  # paste into CSFLE_MASTER_KEY_HEX
docker-compose restart zeroauth
```

### Rate limiting not working

```bash
docker-compose exec redis redis-cli ping
# Expected: PONG
docker-compose exec redis redis-cli keys "rl:*"
```

### Elasticsearch not receiving logs

```bash
docker-compose logs elasticsearch
curl http://localhost:9200/_cluster/health
# Check ELASTICSEARCH_URL in .env matches the container name: http://elasticsearch:9200
```

### WebAuthn registration failing

```bash
# Verify RP_ID matches the domain your frontend runs on
# RP_ORIGIN must include the scheme: http://localhost:3000 (not localhost:3000)
# During local dev, use localhost — changing RP_ID after first credential breaks all existing passkeys
```

## 🗺️ SaaS Product Roadmap

Auth is solved. Below is everything a real SaaS product needs on top of this foundation — organized by category with individual todo items.

### 🔥 Priority — Build These First

The items below should be tackled before anything else. They cover the foundational UX, compliance, and infrastructure every SaaS needs regardless of niche.

**UI & UX**
- [ ] Dark / light mode toggle — system preference detection + manual override, persisted
- [ ] Toast notification system — global toast context for success/error feedback
- [ ] Loading skeletons — skeleton screens instead of spinners
- [ ] Mobile-responsive dashboard — all pages usable on phone
- [ ] Keyboard navigation — focus rings, skip-to-main, ARIA roles on modals and dropdowns
- [ ] Internationalization (i18n) — next-intl with English default, ready for translations

**Mobile & PWA**
- [ ] Progressive Web App (PWA) — `manifest.json`, service worker, "Add to Home Screen"
- [ ] Offline support — cache dashboard shell; queue writes offline, sync on reconnect
- [ ] Deep linking — invite and magic-link URLs open correctly in web and native app

**In-app Notifications**
- [ ] Notification model — per-user with `read`/`unread` state
- [ ] Bell icon + dropdown — notification center UI in dashboard nav
- [ ] Mark as read — single and bulk
- [ ] Real-time delivery — Server-Sent Events (SSE) or WebSocket push
- [ ] Email fallback — deliver via email if user hasn't visited in N days

**File Storage & Uploads**
- [ ] Avatar upload — resize + optimize, store to S3/R2
- [ ] File attachments — per-feature uploads with type/size validation
- [ ] S3-compatible storage — AWS S3, Cloudflare R2, or MinIO for local dev
- [ ] Pre-signed URLs — secure direct-to-storage uploads from the browser
- [ ] CDN delivery — serve files from edge for fast global access

**Organizations & Teams**
- [ ] Workspace model — one org → many members, one user → many orgs
- [ ] Invite by email — time-limited signed invite links
- [ ] Org roles — owner, admin, member, viewer with permission checks
- [ ] Transfer ownership — reassign org owner with confirmation flow
- [ ] Org settings page — name, logo, slug, billing contact
- [ ] Per-org billing — one Stripe subscription per organization
- [ ] Remove / leave org — with safety checks (can't remove last owner)
- [ ] Custom org roles & permissions — fine-grained resource permissions defined per org
- [ ] Per-tenant branding — org logo, brand color, app name replace defaults

**Email**
- [ ] Transactional email templates — welcome, verify, invite, receipt, password reset, trial expiry
- [ ] React Email or MJML — proper HTML templates, not raw strings
- [ ] Email queue — Bull/BullMQ so sending never blocks a request
- [ ] Notification preferences — users choose which emails they receive
- [ ] Unsubscribe tokens — one-click unsubscribe with signed tokens (CAN-SPAM)

**Customer Support**
- [ ] Live chat widget — Crisp, Intercom, or Tawk.to embed in dashboard layout
- [ ] Help center — `/help` searchable FAQ (Mintlify, GitBook, or plain MDX)
- [ ] In-app feedback — thumbs up/down or NPS survey after key actions
- [ ] Support ticket model — lightweight tickets if you don't want a third-party tool

**Error Monitoring & Observability**
- [ ] Sentry — client-side error boundaries + server-side exception capture
- [ ] Health status page — public `status.yourapp.com` uptime check
- [ ] Alerting — Elasticsearch watcher or PagerDuty/Slack on error spike or latency breach
- [ ] Distributed tracing — OpenTelemetry already wired; add Jaeger/Tempo trace viewer

**SEO & Marketing**
- [ ] Blog or changelog — MDX pages under `/blog` and `/changelog`
- [ ] Proper meta tags — `<title>`, Open Graph, Twitter cards on every page
- [ ] Sitemap.xml + robots.txt — generated at build time from Next.js
- [ ] Cookie consent banner — GDPR-compliant accept/reject
- [ ] Analytics script — Plausible or Google Analytics with consent gate

**Legal & Compliance**
- [ ] Privacy policy page — `/privacy`
- [ ] Terms of service page — `/terms`
- [ ] GDPR data export — "Export my data" downloads JSON zip
- [ ] Account deletion — 30-day soft-delete grace period, then purge all PII
- [ ] Data retention policy — auto-purge audit logs and old sessions after N days

**CI/CD & Deployment**
- [ ] GitHub Actions — lint + type-check + test on every PR
- [ ] Docker production build — multi-stage Dockerfile, push to ghcr.io
- [ ] One-click deploy — Railway / Render / Fly.io deploy button in this README
- [ ] Environment parity — staging environment that mirrors production
- [ ] DB backup — daily MongoDB dump to S3 with 30-day retention
- [ ] Secret rotation — document how to rotate TOKEN_SECRET_HEX without downtime

**Multi-language (i18n)**
- [ ] i18n foundation — install next-intl (or react-i18next); define message namespaces; wrap app in provider
- [ ] Translation file structure — JSON files per locale under `/messages/{locale}.json`; enforce no hardcoded UI strings
- [ ] Locale detection — read `Accept-Language` header on first visit; fallback to stored preference on user profile; cookie-persist choice
- [ ] Language switcher — dropdown in nav and settings page; persists to user profile via API
- [ ] Locale-aware formatting — use `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat` everywhere; no manual date string building
- [ ] RTL layout support — `dir="rtl"` toggle on `<html>`; audit CSS for absolute positioning that breaks in RTL; test with Arabic
- [ ] Locale-aware email templates — send emails in the user's stored locale; translate subject lines and body
- [ ] hreflang tags — add `<link rel="alternate" hreflang="…">` to all marketing pages for multilingual SEO
- [ ] Translation management workflow — Crowdin or Lokalise for translator-facing UI; or keep JSON files in-repo with a contribution guide
- [ ] Missing translation fallback — always fall back to English rather than showing a key string; log missing keys in dev mode

**Multi-currency & Pricing**
- [ ] Currency detection — infer from IP geolocation on first visit; allow manual override; store preference on user/org profile
- [ ] Currency switcher UI — dropdown in pricing page, checkout, and billing settings; updates all prices instantly client-side
- [ ] Stripe multi-currency price objects — create one `Price` per currency per plan in Stripe dashboard; select correct price at checkout by stored currency
- [ ] Exchange rate integration — fetch daily rates from Open Exchange Rates, Fixer.io, or ECB; cache in Redis with 24 h TTL; never call live on each request
- [ ] `Intl.NumberFormat` everywhere — format all money values with locale + currency code; no manual `$` prefixes or hardcoded decimal points
- [ ] Purchasing Power Parity (PPP) — apply automatic regional discount % based on country; show "Local pricing available" banner; use `ppp` npm package or own table
- [ ] Presentment currency vs settlement — show user their local currency but settle in your base currency (USD/EUR); communicate clearly on invoice
- [ ] Invoice in customer's currency — generate PDF invoices with the currency and amount the customer actually paid, not the base currency equivalent
- [ ] Multi-currency admin dashboard — convert all plan values to base currency for MRR/ARR charts using stored exchange rates; show raw currency breakdown table
- [ ] Currency on org profile — orgs on annual plans lock their currency at signup to prevent arbitrage on renewals

---

### All Features by Category

### Billing & Subscriptions

- [ ] **Stripe integration** — subscriptions, one-time charges, setup intents
- [ ] **Pricing tier model** — free, pro, enterprise stored per user/org
- [ ] **Feature gates** — check plan before allowing access to paid features
- [ ] **Usage counters** — track seats, API calls, storage per billing period
- [ ] **Stripe Customer Portal** — let users manage cards, cancel, download invoices
- [ ] **Stripe webhook handler** — react to `subscription.updated`, `invoice.payment_failed`, `customer.subscription.deleted`
- [ ] **Trial period** — 14-day trial with automated expiry and upgrade prompt
- [ ] **Upgrade/downgrade flows** — proration, immediate vs end-of-cycle

### Organizations & Teams

- [ ] **Workspace model** — one org → many members, one user → many orgs
- [ ] **Invite by email** — time-limited signed invite links
- [ ] **Org roles** — owner, admin, member, viewer with permission checks
- [ ] **Transfer ownership** — reassign org owner with confirmation flow
- [ ] **Org settings page** — name, logo, slug, billing contact
- [ ] **Per-org billing** — one Stripe subscription per organization
- [ ] **Remove / leave org** — with safety checks (can't remove last owner)

### Email

- [ ] **Transactional email templates** — welcome, verify, invite, receipt, password reset, trial expiry
- [ ] **React Email or MJML** — proper HTML templates, not raw strings
- [ ] **Email queue** — Bull/BullMQ so sending never blocks a request
- [ ] **Notification preferences** — users choose which emails they receive
- [ ] **Unsubscribe tokens** — one-click unsubscribe with signed tokens (CAN-SPAM)

### File Storage & Uploads

- [ ] **Avatar upload** — resize + optimize, store to S3/R2
- [ ] **File attachments** — per-feature uploads with type/size validation
- [ ] **S3-compatible storage** — AWS S3, Cloudflare R2, or MinIO for local dev
- [ ] **Pre-signed URLs** — secure direct-to-storage uploads from the browser
- [ ] **CDN delivery** — serve files from edge for fast global access

### Onboarding

- [ ] **Welcome email** — sent immediately after registration
- [ ] **Setup checklist** — complete profile, invite teammate, add billing — with progress tracking
- [ ] **Empty states** — every list/table has a helpful empty state with CTA
- [ ] **Product tour** — lightweight tooltip walkthrough on first login (Shepherd.js / Driver.js)
- [ ] **Onboarding completion event** — fire analytics event + Slack notify on new signups

### In-app Notifications

- [ ] **Notification model** — per-user with `read`/`unread` state
- [ ] **Bell icon + dropdown** — notification center UI in dashboard nav
- [ ] **Mark as read** — single and bulk
- [ ] **Real-time delivery** — Server-Sent Events (SSE) or WebSocket push
- [ ] **Email fallback** — deliver via email if user hasn't visited in N days

### Developer API Keys

- [ ] **API key model** — named, hashed (never store plain), scoped, per-user or per-org
- [ ] **Key creation UI** — generate key, show once, copy to clipboard
- [ ] **Usage tracking** — request count per key, last-used timestamp
- [ ] **Rotate / revoke** — instant revocation, forced rotation policy
- [ ] **Key scopes** — `read:data`, `write:data`, `admin` — enforced in middleware

### Webhooks (user-facing)

- [ ] **Webhook endpoint management** — users add/edit/delete their own URLs
- [ ] **Event catalog** — define all events your platform emits
- [ ] **Signed payloads** — HMAC-SHA256 signature header
- [ ] **Delivery logs** — show each attempt, response status, retry count
- [ ] **Retry with backoff** — automatic retry on 5xx/timeout, up to 3 days

### Feature Flags & Plan Limits

- [ ] **Entitlement table** — map plan → features + limits
- [ ] **Gate middleware** — `requirePlan("pro")` or `requireEntitlement("feature_x")`
- [ ] **Upgrade prompt component** — consistent "upgrade to Pro" modal/banner
- [ ] **Gradual rollout flags** — enable features for % of users or specific accounts
- [ ] **Override flags** — admin force-enables for specific users (trials, support)

### Analytics & Reporting

- [ ] **Product analytics** — PostHog or Plausible for page views + feature usage events
- [ ] **Revenue dashboard** — MRR, ARR, churn rate, LTV in admin panel
- [ ] **Funnel tracking** — signup → activation → paid conversion
- [ ] **Per-user usage stats** — API calls, storage, seats on billing page
- [ ] **Export to CSV** — admin exports user list and revenue data

### Admin Enhancements

- [ ] **Impersonate user** — log in as any user for support (with audit log entry)
- [ ] **Broadcast email** — send announcement to all users or filtered segments
- [ ] **Manual plan override** — bump user to pro, add trial days, apply coupon
- [ ] **Feature flag management UI** — toggle rollout flags per-user or globally
- [ ] **Revenue metrics** — MRR, active subscriptions, failed payments at a glance

### Error Monitoring & Observability

- [ ] **Sentry** — client-side error boundaries + server-side exception capture
- [ ] **Health status page** — public `status.yourapp.com` uptime check
- [ ] **Alerting** — Elasticsearch watcher or PagerDuty/Slack on error spike or latency breach
- [ ] **Distributed tracing** — OpenTelemetry already wired; add Jaeger/Tempo trace viewer

### SEO & Marketing

- [ ] **Blog or changelog** — MDX pages under `/blog` and `/changelog`
- [ ] **Proper meta tags** — `<title>`, Open Graph, Twitter cards on every page
- [ ] **Sitemap.xml + robots.txt** — generated at build time from Next.js
- [ ] **Cookie consent banner** — GDPR-compliant accept/reject
- [ ] **Analytics script** — Plausible or Google Analytics with consent gate

### Legal & Compliance

- [ ] **Privacy policy page** — `/privacy`
- [ ] **Terms of service page** — `/terms`
- [ ] **GDPR data export** — "Export my data" downloads JSON zip
- [ ] **Account deletion** — 30-day soft-delete grace period, then purge all PII
- [ ] **Data retention policy** — auto-purge audit logs and old sessions after N days

### CI/CD & Deployment

- [ ] **GitHub Actions** — lint + type-check + test on every PR
- [ ] **Docker production build** — multi-stage Dockerfile, push to ghcr.io
- [ ] **One-click deploy** — Railway / Render / Fly.io deploy button in this README
- [ ] **Environment parity** — staging environment that mirrors production
- [ ] **DB backup** — daily MongoDB dump to S3 with 30-day retention
- [ ] **Secret rotation** — document how to rotate TOKEN_SECRET_HEX without downtime

### UI & UX

- [ ] **Dark / light mode toggle** — system preference detection + manual override, persisted
- [ ] **Toast notification system** — global toast context for success/error feedback
- [ ] **Loading skeletons** — skeleton screens instead of spinners
- [ ] **Mobile-responsive dashboard** — all pages usable on phone
- [ ] **Keyboard navigation** — focus rings, skip-to-main, ARIA roles on modals and dropdowns
- [ ] **Internationalization (i18n)** — next-intl with English default, ready for translations

### Customer Support

- [ ] **Live chat widget** — Crisp, Intercom, or Tawk.to embed in dashboard layout
- [ ] **Help center** — `/help` searchable FAQ (Mintlify, GitBook, or plain MDX)
- [ ] **In-app feedback** — thumbs up/down or NPS survey after key actions
- [ ] **Support ticket model** — lightweight tickets if you don't want a third-party tool

### Loyalty & Rewards System

- [ ] **Points model** — `UserPoints` collection: balance, lifetime total, expiry date per user
- [ ] **Earning rules engine** — configurable rules: daily login (+10 pts), referral signup (+200 pts), first payment (+500 pts), plan anniversary (+250 pts), profile complete (+50 pts), leaving a review (+100 pts)
- [ ] **Tier system** — Bronze (0–999), Silver (1 000–4 999), Gold (5 000–19 999), Platinum (20 000+); tier re-evaluated on every points change
- [ ] **Tier benefits** — perks per tier: extra API quota, storage bonus, priority support badge, discount %, extended session TTL
- [ ] **Redemption catalog** — spend points on: account credit (100 pts = $1), feature unlock, extended trial, plan upgrade, swag codes
- [ ] **Points history page** — timestamped ledger of every earn and spend event
- [ ] **Expiry policy** — points expire after 12 months of inactivity; warning email at 30 days
- [ ] **Birthday & anniversary bonuses** — auto-award on account anniversary and user birthday
- [ ] **Referral multiplier** — referred users earn 1.5× points in their first 90 days
- [ ] **Admin controls** — manually award/deduct points, bulk-award to a segment, adjust tier thresholds
- [ ] **Leaderboard** — opt-in public leaderboard of top earners (anonymized option)
- [ ] **Points badge on profile** — tier badge and point count in dashboard nav

### Referral & Affiliate Program

- [ ] **Referral link generator** — unique signed short-link per user (`yourapp.com/r/abc123`)
- [ ] **Referral tracking** — cookie + UTM attribution, store `referredBy` on new user
- [ ] **Referral rewards** — referrer gets credit/points when referee converts; referee gets discount
- [ ] **Referral dashboard** — clicks, signups, conversions per link
- [ ] **Affiliate portal** — `/affiliate` section with unique codes, commission rates, payout history
- [ ] **Payout integration** — Stripe Connect, PayPal Payouts, or Wise on the 1st of each month
- [ ] **Fraud detection** — flag self-referrals (same IP/device), churn-within-7-days referrals

### Gamification & Engagement

- [ ] **Achievement badges** — "First Login", "Power User" (30-day streak), "Team Player" (5 invites), "Early Adopter"
- [ ] **Streak tracking** — daily login streak with grace period; shown in dashboard
- [ ] **Progress bars** — onboarding %, profile completeness %, plan usage %
- [ ] **Weekly challenges** — opt-in challenges with point rewards on completion
- [ ] **Level-up notifications** — in-app + email when user crosses a tier threshold
- [ ] **Social sharing** — "I just reached Gold tier!" OG image generated with Satori

### White-labeling & Custom Domains

- [ ] **Custom domain per tenant** — orgs map `app.theirdomain.com` (Cloudflare for SaaS / Vercel Domains API)
- [ ] **Custom subdomain** — auto-provision `theirorg.yourapp.com` on org creation
- [ ] **Per-tenant branding** — org logo, brand color, app name replace defaults
- [ ] **Custom email domain** — org sends from `noreply@theirdomain.com` via SendGrid/Resend
- [ ] **Remove "Powered by" badge** — white-label tier hides all starter branding
- [ ] **Custom login page** — org-specific login URL with their logo and SSO button

### Integrations & Automation

- [ ] **Zapier integration** — publish Zapier app with triggers and actions
- [ ] **Make (Integromat) integration** — share OpenAPI spec to auto-generate module
- [ ] **Slack app** — slash commands + DM notifications for key events
- [ ] **Native integration marketplace** — `/integrations` page with per-user OAuth flows
- [ ] **HubSpot / Salesforce sync** — push signups and plan changes to CRM
- [ ] **Segment.io or Rudderstack** — server-side analytics pipeline to any downstream tool

### Revenue Recovery & Retention

- [ ] **Dunning management** — retry failed payments on days 3, 7, 14 with escalating emails
- [ ] **Pause subscription** — users pause (not cancel) for up to 3 months
- [ ] **Cancellation flow** — offboarding survey, offer discount or pause as alternatives
- [ ] **Win-back campaign** — automated emails to churned users at 7, 30, 90 days
- [ ] **Usage-based upsell nudges** — "You've used 80% of your storage quota" → upgrade prompt
- [ ] **Lifetime deal (LTD) support** — one-payment plan type with usage cap enforcement

### Enterprise Features

- [ ] **SAML 2.0 SSO** — SP-initiated SSO for Okta, Azure AD, Google Workspace
- [ ] **SCIM provisioning** — auto-create/deactivate users from Azure AD / Okta (RFC 7644)
- [ ] **Custom org roles & permissions** — fine-grained resource permissions defined per org
- [ ] **Audit log export** — CSV download or SIEM stream (Splunk, Datadog, Elastic)
- [ ] **Data residency** — choose storage region (EU / US / APAC) per org
- [ ] **SLA tiers** — 99.9% for Pro, 99.99% for Enterprise; SLA credit automation
- [ ] **Dedicated instance** — single-tenant deployment: own MongoDB, Redis, subdomain
- [ ] **SOC 2 Type II readiness** — access control evidence, change management, incident response checklist
- [ ] **IP allowlist per org** — restrict API + dashboard access to specific CIDR ranges

### Mobile & Offline

- [ ] **React Native / Expo app** — shared auth logic; biometric login via passkeys
- [ ] **Web push notifications** — service worker + Push API
- [ ] **Progressive Web App (PWA)** — `manifest.json`, service worker, "Add to Home Screen"
- [ ] **Offline support** — cache dashboard shell; queue writes offline, sync on reconnect
- [ ] **Deep linking** — invite and magic-link URLs open correctly in web and native app

### AI & Smart Features

- [ ] **AI onboarding assistant** — chat widget guiding new users through setup (Claude / GPT-4o)
- [ ] **Smart search** — Elasticsearch semantic search or OpenAI embeddings
- [ ] **Churn prediction score** — logistic regression on usage signals → at-risk score in admin
- [ ] **Auto-generated reports** — weekly digest email with LLM-written summary of account activity
- [ ] **AI support bot** — trained on help docs; deflects tier-1 support before escalating to human
- [ ] **Usage recommendations** — personalized "try this feature" suggestions based on similar accounts

### Tax, Multi-currency & Global

- [ ] **Stripe Tax** — auto-calculate VAT / GST / sales tax by customer location
- [ ] **Tax exemption certificates** — nonprofits and EU B2B orgs submit VAT ID
- [ ] **Multi-currency pricing** — display prices in local currency; Stripe handles FX
- [ ] **Purchasing Power Parity (PPP)** — automatic regional discounts based on country GDP
- [ ] **EU VAT compliance** — collect and validate EU VAT numbers via VIES; reverse-charge on B2B

### Advanced Search & Discovery

- [ ] **Global command palette** — `Cmd+K` / `Ctrl+K` searching users, settings, docs, recent actions
- [ ] **Elasticsearch full-text search** — already have ES running; index content and surface results
- [ ] **Faceted filters** — filter by type, date, plan, status with instant counts
- [ ] **Search analytics** — log no-result queries → identify gaps in docs/features

### Collaboration & Activity

- [ ] **Team activity feed** — per-org timeline: "Alice invited Bob", "Charlie upgraded to Pro"
- [ ] **@mentions** — `@username` in comments triggers in-app + email notification
- [ ] **Threaded comments** — attach comments to any resource with reply threading
- [ ] **Real-time presence** — show which team members are currently online
- [ ] **Shared notes** — lightweight collaborative notes per org (Tiptap + autosave)

### Data, Import & Export

- [ ] **CSV import** — bulk-create users or records from CSV with column-mapping UI
- [ ] **CSV / JSON export** — every list has an "Export" button; stream large exports
- [ ] **Scheduled exports** — daily/weekly automated export to S3 or email attachment
- [ ] **Bulk operations** — select all → bulk delete, status change, tag assign

### Security & Trust

- [ ] **HaveIBeenPwned check** — check password against HIBP on register/change; warn or block
- [ ] **Dependency vulnerability scanning** — `npm audit` in CI; Dependabot/Renovate PRs
- [ ] **Bug bounty program** — responsible disclosure policy at `/security`
- [ ] **Login notification emails** — email on new device login with "Not you? Revoke" link
- [ ] **Account takeover detection** — flag password reset + email change within short window

### Customer Success

- [ ] **Health score per account** — composite of login frequency, feature depth, team size, payments
- [ ] **At-risk account alerts** — Slack/email to CS team when health score drops below threshold
- [ ] **Automated lifecycle emails** — day 1 welcome, day 3 tip, day 7 check-in, day 14 trial warning
- [ ] **NPS survey automation** — in-app NPS at 30 days, quarterly thereafter; export results to CSV
- [ ] **Customer segments** — tag accounts as "champion", "at-risk", "expansion candidate"
- [ ] **Usage benchmarking** — "You're in the top 20% of teams your size" for engagement

---

## License

[Add your license here]
