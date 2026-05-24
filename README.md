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
| MongoDB | 5.0+ | Persistence |
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
| MongoDB | `mongodb://admin:password@localhost:27017` |
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
| `@zeroauth/core` | `./` | Core auth library (Express API, models, services) |
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
app.use(resolveTenant());

// Protect tenant-scoped routes
app.get("/api/data", requireTenant, (req, res) => {
  const { tenantId } = req; // set by resolveTenant()
  // ...
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
├── db/                      # MongoDB connection, health checks, pooling
├── logger/                  # Structured JSON logging, correlation IDs, ES stream
├── shared/
│   └── types.ts             # Canonical type definitions (User, Session, Token…)
├── models/
│   ├── user.model.ts        # User schema with CSFLE hooks
│   ├── tenant.model.ts      # Tenant schema (slug, plan, OIDC/SAML config)
│   └── index.ts             # Session, Role, JIT, AuditLog, RefreshToken, OTP
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
│   ├── server.ts            # Express app factory
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

Sensitive fields encrypted transparently via Mongoose hooks:

- `email`, `phone`, `passwordHash`
- `totp.secret`, OAuth access/refresh tokens
- Custom `encryptedAttributes` map

Encryption: AES-256-GCM with HKDF-derived per-field keys. Key version stored alongside ciphertext for rotation.

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

- [ ] Replace default MongoDB/Redis passwords in `docker-compose.yml`
- [ ] Set `NODE_ENV=production`
- [ ] Configure TLS termination (nginx/Caddy in front of port 3000)
- [ ] Set `ELASTICSEARCH_URL` for audit log shipping
- [ ] Enable `CSFLE_KEY_ROTATION_DAYS` for key rotation schedule
- [ ] Restrict Elasticsearch access to internal network only
- [ ] Set Redis `requirepass` and update `REDIS_URL`
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

### Future

- [ ] **Cross-tenant federation** — federated identity across ZeroAuth deployments
- [ ] **Biometric continuous auth** — re-verify identity mid-session using device sensors
- [ ] **AI-powered anomaly detection** — ML-based behavioral baselines per user

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

### MongoDB connection errors

```bash
docker-compose logs mongodb
docker-compose exec mongodb mongosh -u admin -p password
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

---

## License

[Add your license here]
