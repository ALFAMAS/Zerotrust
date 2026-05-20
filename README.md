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
| Passkeys / WebAuthn | ✅ Schema + service | API routes pending |
| TOTP (authenticator apps) | ✅ Schema + OTP service | Enrollment flow pending |
| Password hashing | ✅ Complete | bcryptjs, configurable rounds |
| OAuth 2.0 — GitHub | ✅ Complete | Provider adapter implemented |
| OAuth 2.0 — Google | ⬜ Pending | Adapter interface ready |
| OAuth 2.0 — Facebook | ⬜ Pending | Adapter interface ready |
| OAuth 2.0 — Apple | ⬜ Pending | Adapter interface ready |
| MFA — Email OTP | ✅ Complete | Nodemailer |
| MFA — SMS OTP | ✅ Complete | Twilio |
| MFA — WhatsApp OTP | ✅ Complete | Twilio |
| MFA — Telegram OTP | ✅ Complete | Telegram Bot API |
| Passwordless (magic link) | ⬜ Pending | — |

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
| Rate limiting — in-memory | ⬜ Pending | Single-process fallback |
| IP-based rate limiting | ✅ Complete | Sliding window counters |
| Security headers middleware | ⬜ Pending | CSP, HSTS, X-Frame-Options |
| Shared Signals Framework (receive) | ✅ Complete | SET validation and ingestion |
| Shared Signals Framework (send) | ✅ Complete | Transmit local compromise signals |
| Workload identity credentials | ✅ Complete | Short-lived scoped tokens |

### API Surface

| Feature | Status | Notes |
|---|---|---|
| Auth routes (register, login, refresh, logout) | ✅ Complete | `src/api/routes/auth.routes.ts` |
| Workload credential routes | ✅ Complete | `src/api/routes/workload.routes.ts` |
| Session management routes | ⬜ Pending | List, revoke, device enumeration |
| MFA enrollment/verification routes | ⬜ Pending | TOTP setup, WebAuthn, backup codes |
| OAuth callback routes | ⬜ Pending | Authorization code exchange |
| Password reset routes | ⬜ Pending | Token-based reset flow |
| Admin routes | ⬜ Pending | User management, role assignment |
| Request validation schemas | ⬜ Pending | Zod schemas for all endpoints |
| OpenAPI / Swagger spec | ⬜ Pending | — |

### Observability

| Feature | Status | Notes |
|---|---|---|
| Structured JSON logging | ✅ Complete | Correlation IDs, ELK-ready |
| Audit log model | ✅ Complete | Schema with forensic fields |
| Elasticsearch audit pipeline | ⬜ Pending | Stream indexing, retention policy |
| Kibana dashboards | ⬜ Pending | Auth metrics, anomaly views |

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

## Project Structure

```
src/
├── config/                  # Environment config loader + validation
├── crypto/
│   └── csfle.ts             # AES-256-GCM field encryption, HKDF key derivation
├── db/                      # MongoDB connection, health checks, pooling
├── logger/                  # Structured JSON logging, correlation IDs, ES stream
├── shared/
│   └── types.ts             # Canonical type definitions (User, Session, Token…)
├── models/
│   ├── user.model.ts        # User schema with CSFLE hooks
│   └── index.ts             # Session, Role, JIT, AuditLog, RefreshToken, OTP
├── services/
│   ├── token.service.ts     # PASETO v4.local token issue/verify
│   ├── authz.service.ts     # ABAC engine, role hierarchy, JIT evaluation
│   ├── fingerprint.service.ts
│   └── rateLimiter/
│       └── redis.ts         # Redis token bucket rate limiter
├── middleware/
│   ├── auth.ts              # Token verification, session hydration
│   ├── deviceAttestation.ts # Fingerprint comparison, anomaly flagging
│   ├── continuousEval.ts    # Per-request risk scoring + ABAC enforcement
│   ├── rateLimiting.ts      # Multi-layer rate limiting orchestration
│   ├── geoFencing.ts        # Country/subnet access control
│   ├── temporalAccess.ts    # Schedule-based restrictions, JIT expiry
│   ├── proofOfPossession.ts # Nonce-based token-to-device binding
│   ├── sessionControl.ts    # Concurrent device limits, session revocation
│   └── validation.ts        # Field presence and method guards
├── api/
│   ├── server.ts            # Express app factory
│   ├── auth/index.ts        # Auth request handlers
│   └── routes/
│       ├── auth.routes.ts   # Register, login, refresh, logout
│       └── workload.routes.ts
├── oauth/
│   ├── provider.factory.ts  # Provider-agnostic adapter interface
│   └── providers/
│       └── github.ts        # GitHub OAuth adapter
├── mfa/
│   ├── index.ts             # OTP dispatch
│   └── channels/            # email | sms | whatsapp | telegram
├── ssf/
│   ├── receiver.ts          # Ingest SET payloads, trigger revocations
│   ├── sender.ts            # Transmit local security events
│   └── verify.ts            # SET signature validation
├── workload/
│   └── index.ts             # Short-lived workload credential issuance
└── __tests__/
    └── fingerprint.test.ts
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

# Google, Facebook, Apple — adapters pending, keys can be pre-configured
OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=
OAUTH_GOOGLE_REDIRECT_URI=http://localhost:3000/auth/oauth/google/callback
```

### MFA Channels

```env
MFA_EMAIL_ENABLED=true
MFA_SMS_ENABLED=false
MFA_WHATSAPP_ENABLED=false
MFA_TELEGRAM_ENABLED=false
```

---

## Architecture

### Request Lifecycle

```
Incoming Request
      │
      ▼
┌─────────────────────────┐
│  Rate Limiting Layer    │  In-memory → Redis → IP sliding window
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
         Audit Log
```

### Token Architecture

```
Login Success
      │
      ▼
TokenService.issue()
  ├── PASETO v4.local (AES-256-GCM)
  ├── Payload: userId, sessionId, roles, deviceId
  ├── Cryptographic binding (PoP nonce)
  └── 15-min access token + rotating refresh token

Per Request
  ├── PASETO verify
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

> Full OpenAPI spec is pending. Current implemented routes:

### Auth (`/auth`)

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Password or passkey login |
| POST | `/auth/refresh` | Rotate access token |
| POST | `/auth/logout` | Revoke session |
| POST | `/auth/logout/all` | Revoke all sessions |

### Workload (`/workload`)

| Method | Path | Description |
|---|---|---|
| POST | `/workload/credentials` | Issue scoped workload token |
| POST | `/workload/validate` | Validate workload token |

### Pending Routes

- `GET/DELETE /sessions` — session list and revocation
- `POST /auth/mfa/totp/setup`, `/auth/mfa/verify`
- `GET /auth/oauth/:provider`, `/auth/oauth/:provider/callback`
- `POST /auth/password-reset/request`, `/auth/password-reset/confirm`
- `POST /auth/passkey/register`, `/auth/passkey/authenticate`
- `POST /ssf/events` — SSF webhook ingestion

---

## Testing

```bash
bun run test              # run all tests (vitest)
bun run test:watch        # watch mode
bun run test:coverage     # coverage report (v8)

# Run a specific file
bun run test src/__tests__/fingerprint.test.ts
```

**Current coverage:** The `fingerprint.service` is tested. All other modules need test coverage — see [Roadmap](#roadmap--todo).

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

---

## Security

### Best Practices

1. Never commit `.env` — use `.env.example` as the template only
2. Rotate `TOKEN_SECRET_HEX` and `CSFLE_MASTER_KEY_HEX` on schedule using `CSFLE_KEY_ROTATION_DAYS`
3. Enforce HTTPS at the load balancer — ZeroAuth runs plain HTTP internally
4. Subscribe to provider SSF streams (Google, GitHub) so account compromise triggers automatic session revocation
5. Run `npm audit` or `bun audit` in CI on every push
6. Review Kibana audit dashboards for anomaly spikes before each release

### Vulnerability Reporting

Send security issues to: **mas.arafat.dev@gmail.com**

Do not open public GitHub issues for vulnerabilities.

---

## Roadmap & TODO

Items are grouped by category and ordered by priority within each group.

### API Completeness

- [ ] **Session routes** — `GET /sessions` (list active), `DELETE /sessions/:id` (revoke single), `DELETE /sessions` (revoke all except current)
- [ ] **MFA routes** — TOTP setup (`POST /auth/mfa/totp/setup` + QR code), TOTP verify, backup code generation and redemption
- [ ] **OAuth routes** — initiation (`GET /auth/oauth/:provider`), callback (`GET /auth/oauth/:provider/callback`), account link/unlink
- [ ] **Password reset** — request token (`POST /auth/password-reset/request`), validate and apply (`POST /auth/password-reset/confirm`)
- [ ] **Passkey / WebAuthn** — registration options and response (`POST /auth/passkey/register/options`, `/auth/passkey/register`), authentication flow
- [ ] **SSF webhook endpoint** — `POST /ssf/events` wired into `ssf/receiver.ts`
- [ ] **Admin routes** — user lookup, role assignment, session revocation by admin, JIT grant management

### Request Validation

- [ ] Add Zod schemas in `src/api/schemas/` for every route body, params, and query
- [ ] Wire schemas into `src/middleware/validation.ts` centrally
- [ ] Return consistent error envelope `{ code, message, details[] }` on validation failure
- [ ] Validate redirect URIs against allowlist on every OAuth initiation request
- [ ] Enforce password complexity rules (length, entropy) in registration schema

### OAuth Providers

- [ ] **Google** — `src/oauth/providers/google.ts`: exchange code, verify ID token signature, normalize claims, handle token refresh, store encrypted in CSFLE
- [ ] **Facebook** — `src/oauth/providers/facebook.ts`: Graph API profile fetch, handle app-scoped user IDs
- [ ] **Apple** — `src/oauth/providers/apple.ts`: Sign in with Apple JWKS validation, `name` claim only on first request
- [ ] PKCE (`code_challenge` / `code_verifier`) support for all public OAuth clients
- [ ] State + nonce parameter enforcement on all OAuth flows
- [ ] Provider token refresh and re-encryption on rotation

### Rate Limiting

- [ ] **In-memory rate limiter** — `src/services/rateLimiter/inmemory.ts`: token bucket for single-process deployments and as a fast pre-check before Redis
- [ ] Exponential backoff with jitter for repeat violators
- [ ] Temporary IP ban with configurable duration after threshold breach
- [ ] Per-endpoint override config (login stricter than token refresh)
- [ ] Emit audit events on rate limit violations

### Security Hardening

- [ ] **Security headers middleware** — `src/middleware/securityHeaders.ts`: CSP, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; wire into `api/server.ts` after Helmet
- [ ] Account lockout policy — lock after N failed login attempts, notify user, admin unlock route
- [ ] Enforce maximum concurrent devices per user (model exists, enforcement needs API wiring)
- [ ] Rotate refresh tokens on every use (prevent refresh token replay)
- [ ] Add `jti` (JWT ID equivalent) to PASETO payloads for single-use enforcement on sensitive flows

### Audit & Observability

- [ ] **Elasticsearch audit pipeline** — `src/audit/index.ts`: bulk-index `AuditLog` documents into `zeroauth-audit-YYYY-MM-DD`, configurable flush interval and batch size
- [ ] Index lifecycle management (ILM) policy in Elasticsearch for audit log retention
- [ ] Kibana saved dashboards: auth success/failure rates, MFA adoption, denied access patterns, rate limit heatmap, device anomaly alerts
- [ ] Mask sensitive fields (OTP codes, token fragments) before log shipping
- [ ] Elasticsearch health check wired into `/healthz` endpoint

### Testing

- [ ] **Unit tests for TokenService** — issue, verify, expiry, revoked session, tampered payload
- [ ] **Unit tests for AuthorizationEngine** — ABAC condition evaluation, role hierarchy resolution, JIT grant lifecycle
- [ ] **Unit tests for CSFLE** — encrypt/decrypt round-trip, key rotation, schema plugin hooks
- [ ] **Unit tests for each MFA channel** — mock transports, OTP expiry, retry limits
- [ ] **Unit tests for OAuth adapters** — mock provider responses, normalized user mapping, error cases
- [ ] **Integration tests** — register → login → access protected route → refresh → logout flow
- [ ] **Middleware integration tests** — rate limiting under burst, geo-fence enforcement, temporal window edge cases
- [ ] **Test coverage gate** — enforce ≥ 80% coverage in CI; fail build below threshold
- [ ] **Load tests** — k6 or Artillery scripts: 1000 concurrent logins, refresh token storm, session revocation cascade
- [ ] **Chaos tests** — MongoDB failover, Redis outage, Elasticsearch unavailability; verify graceful degradation

### Documentation

- [ ] **OpenAPI 3.1 spec** — `src/api/openapi.yaml`: all routes, request/response schemas, security schemes, examples
- [ ] **Swagger UI** — mount at `/docs` in development builds using `swagger-ui-express`
- [ ] WebAuthn registration and authentication sequence diagrams
- [ ] ABAC condition language reference with examples
- [ ] JIT access request and approval workflow guide
- [ ] SSF integration guide (subscribing to provider streams, processing SETs)
- [ ] Deployment guide: Kubernetes / Helm chart, nginx TLS termination, Elasticsearch ILM

### CI/CD

- [ ] GitHub Actions workflow: lint → type-check → test → build on every PR
- [ ] Coverage report posted as PR comment
- [ ] `npm audit` / `bun audit` on dependency changes
- [ ] Docker image build and push to registry on merge to `main`
- [ ] Semantic release with auto-generated CHANGELOG from conventional commits

### Developer Experience

- [ ] CLI tool: `npx zeroauth init` to scaffold `.env`, generate keys, and run Docker stack
- [ ] Prettier + ESLint pre-commit hook via Husky
- [ ] VS Code `launch.json` for attaching debugger to `bun run dev`

### Future / Post-MVP

- [ ] OIDC provider — expose ZeroAuth itself as an OIDC identity provider
- [ ] SAML 2.0 — SP-initiated SSO for enterprise integrations
- [ ] Multi-tenant support — tenant isolation at the data model and middleware level
- [ ] SDK client libraries — typed fetch wrappers for consuming ZeroAuth from frontend apps
- [ ] Admin UI — Next.js dashboard for user management, session oversight, and audit log review

---

## Contributing

1. Work in TypeScript strict mode — no `any`, no disabled lint rules without comment explaining why
2. Every new module needs at least one test file
3. Security-sensitive changes require a description of the threat model in the PR body
4. Run `bun run lint && bun run format && bun run type-check` before opening a PR
5. Update `CHANGELOG.md` under `[Unreleased]` for any user-visible change

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

---

## License

[Add your license here]
