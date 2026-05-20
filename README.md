# ZeroAuth - Zero-Trust Authentication & Authorization System

A production-grade, zero-trust authentication and authorization system built with TypeScript, Mongoose, and modern cryptographic standards. Designed for enterprise security with continuous access evaluation, device attestation, and comprehensive audit logging.

## 🎯 Key Features

### Authentication

- ✅ **OAuth 2.0 Integration** - Google, Facebook, GitHub, Apple (provider-agnostic framework)
- ✅ **Multi-Factor Authentication** - TOTP, WebAuthn/Passkeys, with email/SMS/WhatsApp/Telegram channels
- ✅ **Passwordless Authentication** - Passkeys with hardware-backed device attestation
- ✅ **PASETO v4.local Tokens** - Platform-agnostic security tokens (no JWT confusion vulnerabilities)
- ✅ **Cryptographic Session Binding** - Proof-of-Possession validation to prevent token theft

### Authorization

- ✅ **Attribute-Based Access Control (ABAC)** - Dynamic, context-aware access decisions
- ✅ **Role-Based Access Control (RBAC)** - Hierarchical roles with permission inheritance
- ✅ **Just-In-Time (JIT) Privilege Escalation** - Temporal privilege grants with auto-revocation
- ✅ **Continuous Access Evaluation** - Real-time risk assessment and policy enforcement

### Security

- ✅ **Client-Side Field Level Encryption (CSFLE)** - Transparent encryption for sensitive data
- ✅ **Device Fingerprinting** - Detect compromised endpoints mid-session
- ✅ **Device Attestation** - WebAuthn hardware verification
- ✅ **Shared Signals Framework (SSF)** - Receive/transmit compromise signals
- ✅ **Rate Limiting** - Multi-layer (in-memory, Redis, IP-based)
- ✅ **Geo-fencing** - Geographic and IP-based access control

### Observability

- ✅ **Immutable Audit Logging** - Complete forensic trail to Elasticsearch
- ✅ **Structured JSON Logging** - ELK stack integration
- ✅ **Correlation IDs** - Request tracing across services
- ✅ **Real-time Alerting** - Elasticsearch alerting rules

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or Bun 1.0+
- MongoDB 5.0+
- Redis 7.0+ (for distributed rate limiting)
- Elasticsearch 8.0+ (optional, for audit logs)

### Docker Setup (Recommended)

```bash
# Clone and setup
git clone <repo>
cd zeroauth
cp .env.example .env

# Start all services with Docker Compose
docker-compose up -d

# Verify services are healthy
docker-compose ps
docker-compose logs -f zeroauth
```

Services will be available at:

- API: `http://localhost:3000`
- MongoDB: `mongodb://admin:password@localhost:27017`
- Redis: `redis://localhost:6379`
- Elasticsearch: `http://localhost:9200`
- Kibana: `http://localhost:5601`

### Local Development

```bash
# Install dependencies
bun install  # or: npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Initialize database and encryption keys
bun src/index.ts

# Run in development mode
bun run dev

# Run tests
bun run test

# Build for production
bun run build
```

## 📁 Project Structure

```
src/
├── config/              # Environment configuration management
├── crypto/              # CSFLE encryption management
├── db/                  # MongoDB connection & health checks
├── logger/              # Structured logging infrastructure
├── models/              # Mongoose schemas (User, Session, Role, etc.)
├── services/            # Core services (Authorization, Token, Fingerprinting)
├── middleware/          # Express middleware (auth, validation, rate limiting)
├── api/                 # REST API routes (Phase 2)
├── oauth/               # OAuth provider implementations (Phase 2)
├── mfa/                 # MFA channel implementations (Phase 2)
├── audit/               # Audit logging to Elasticsearch (Phase 4)
├── ssf/                 # Shared Signals Framework (Phase 4)
├── workload/            # Workload identity credentials (Phase 4)
└── shared/types.ts      # Central type definitions
```

## 🔐 Configuration

All configuration is environment-based. See `.env.example` for complete options.

### Critical Security Keys

Generate secure random keys:

```bash
# Generate 32-byte random key (64 hex chars)
openssl rand -hex 32
```

Set these in `.env`:

```
TOKEN_SECRET_HEX=<32-byte random key>
CSFLE_MASTER_KEY_HEX=<32-byte random key>
```

### OAuth Setup

Configure OAuth providers in `.env`:

```
OAUTH_GOOGLE_CLIENT_ID=your-client-id
OAUTH_GOOGLE_CLIENT_SECRET=your-client-secret
OAUTH_GOOGLE_REDIRECT_URI=http://localhost:3000/auth/oauth/google/callback
```

### MFA Channels

Enable desired channels:

```
MFA_EMAIL_ENABLED=true
MFA_SMS_ENABLED=false
MFA_WHATSAPP_ENABLED=false
MFA_TELEGRAM_ENABLED=false
```

## 🏗️ Architecture

### Authentication Flow

```
┌─ User Registration ─────────────┐
│  1. Email/phone verification    │
│  2. Password hash + CSFLE       │
│  3. Optional: Passkey enroll    │
└────────────────────────────────┘
                ↓
┌─ Login Challenge ──────────────┐
│  1. Email/password OR passkey   │
│  2. MFA challenge (if enabled)  │
│  3. Device fingerprinting       │
│  4. Proof-of-possession gen     │
└────────────────────────────────┘
                ↓
┌─ Token Generation ─────────────┐
│  1. PASETO v4.local encryption  │
│  2. Cryptographic binding       │
│  3. Session creation            │
│  4. Refresh token issuance      │
└────────────────────────────────┘
```

### Authorization Flow

```
Request → Auth Middleware
  ├─ Token verification (PASETO)
  ├─ Session validation
  ├─ Device fingerprint check
  └─ Proof-of-possession validation

  ↓

Continuous Evaluation Middleware
  ├─ Schedule restriction check
  ├─ Geofencing validation
  ├─ Risk score calculation
  ├─ ABAC condition evaluation
  └─ Decision: Allow | Deny | Challenge

  ↓

Access Granted / Denied
  └─ Audit log created
```

### CSFLE Implementation

Sensitive fields are transparently encrypted:

- Email, phone, password hash
- TOTP secrets, OAuth tokens
- User attributes

Encryption is handled by Mongoose pre-save/post-retrieve hooks.

## 🔄 Implementation Phases

### Phase 1 ✅ (Foundation - Complete)

- [x] Configuration management
- [x] Database connection layer
- [x] CSFLE encryption foundation
- [x] Structured logging
- [x] Root entry point
- [x] Shared type definitions
- [x] Docker setup

### Phase 2 (API & OAuth - In Progress)

This phase implements the REST surface, OAuth provider integrations, and MFA channel adapters. Each item below lists the purpose, files to add or modify, security considerations, and tests to implement.

- REST API endpoints
  - Purpose: Provide the HTTP endpoints for registration, login, OAuth callbacks, MFA enrollment/verification, passkey flows, token management, password reset, and session management.
  - Files: `src/api/routes/auth.routes.ts`, `src/api/server.ts`, `src/api/routes/session.routes.ts`, `src/api/routes/mfa.routes.ts`, `src/api/routes/oauth.routes.ts`
  - Key behaviors: Input validation, CSFLE-safe persistence, audit logging for security-sensitive actions, proper error codes, idempotency where applicable.
  - Security: Rate-limit high-risk endpoints (login, password reset), require state/nonce for OAuth, implement PKCE for public clients, always validate redirect URIs.
  - Tests: Unit tests for controllers, integration tests for end-to-end flows (register → login → access protected resource).

- OAuth provider factory
  - Purpose: Provider-agnostic abstraction to add providers (Google, Facebook, GitHub, Apple) via configuration rather than code changes.
  - Files: `src/oauth/provider.factory.ts`, `src/oauth/providers/google.ts`, `src/oauth/providers/facebook.ts`, etc.
  - Key behaviors: Exchange authorization code, fetch user profile, normalize provider claims, link or create user accounts, store provider metadata encrypted by CSFLE.
  - Security: Validate provider tokens signature if present, rotate stored refresh tokens, log provider actions to audit, honor Shared Signals Framework signals from providers.
  - Tests: Provider adapter unit tests that mock provider responses and normalized user mapping.

- MFA channel implementations
  - Purpose: Modular channel adapters to send OTPs or messages via Email, SMS (Twilio), WhatsApp (Twilio), Telegram.
  - Files: `src/mfa/channels/email.ts`, `src/mfa/channels/sms.ts`, `src/mfa/channels/whatsapp.ts`, `src/mfa/channels/telegram.ts`, `src/mfa/index.ts`
  - Key behaviors: Retry/backoff, attempt counters, channel-specific rate limits, secure templating for OTPs, recovery/backup code issuance.
  - Security: Never log OTPs; store OTP attempts and expiry; require biometric or identity-proof step-up for high-privilege recovery.
  - Tests: Channel mocks, delivery simulation, and rate-limit enforcement tests.

- Request validation middleware
  - Purpose: Central input-validation using Zod or Joi to validate body, query, and params for every route.
  - Files: `src/middleware/validation.ts`, `src/api/schemas/*.ts`
  - Key behaviors: Strong validation rules for email, phone, password complexity, passkey attestation objects; return consistent error format.
  - Tests: Schema unit tests and integration tests exercising invalid inputs.

### Phase 3 (Middleware & Evaluation - In Progress)

Phase 3 is the core runtime protection layer. Several middleware components have been scaffolded; remaining items describe responsibilities and implementation notes.

- Auth middleware (token verification)
  - Purpose: Verify PASETO v4.local access tokens, token binding (proof-of-possession), session validity, and user status.
  - Files: `src/middleware/auth.ts` (implemented), ensure `initAuthMiddleware()` is called at server startup.
  - Key behaviors: Reject expired/revoked sessions, update lastActivityAt, attach `req.user`, `req.session`, and `req.token` to request.
  - Tests: Token creation & verification unit tests, expired/revoked session tests.

- Device attestation middleware
  - Purpose: Compute device fingerprint, compare with session fingerprint, flag anomalies, and optionally require re-authentication or step-up.
  - Files: `src/middleware/deviceAttestation.ts` (implemented), `src/services/fingerprint.service.ts`
  - Key behaviors: Support strict and permissive modes; preserve audit trail; support marking device as trusted after step-up.
  - Tests: Fingerprint variation tests, device-change workflows.

- Continuous access evaluation
  - Purpose: Real-time ABAC evaluation and risk scoring per request, enforced at the gateway or app layer.
  - Files: `src/middleware/continuousEval.ts` (implemented), `src/services/authz.service.ts`
  - Key behaviors: Aggregate anomaly signals (device, location, time), evaluate ABAC conditions, calculate risk score, return allow/deny/challenge decisions, require MFA step-up for elevated risk.
  - Tests: ABAC condition evaluation scenarios, risk threshold boundary tests.

- Rate limiting (mixed strategy)
  - Purpose: Protect against brute-force and credential stuffing using a layered approach:
    - Fast in-memory token bucket for single-process low-latency checks
    - Redis-backed token bucket for distributed deployments
    - IP-based sliding window counters for suspicious IP tracking
  - Files: `src/middleware/rateLimiting.ts`, `src/services/rateLimiter/redis.ts`, `src/services/rateLimiter/inmemory.ts`
  - Key behaviors: Per-endpoint configurable thresholds, global login limits, exponential backoff and temporary bans, audit and alert on abuse.
  - Security: Back-pressure to slow attackers without denying legitimate users; ensure Redis keys are namespaced and TTL'd.
  - Tests: Simulate bursts, distributed enforcement with mocked Redis.

- Temporal access control
  - Purpose: Enforce schedule-based restrictions via ABAC/time checks and JIT expiry enforcement.
  - Files: `src/middleware/temporalAccess.ts`, use `session.sessionConfig.scheduleRestriction` and `JITModel` for active grants
  - Key behaviors: Timezone-aware checks, auto-revoke expired JIT grants, block out-of-window access.
  - Tests: Timezone edge-case tests and JIT grant lifecycle tests.

- Geo-fencing
  - Purpose: Restrict access by country or IP subnet and detect suspicious geolocation changes.
  - Files: `src/middleware/geoFencing.ts`, use `geoip-lite` service and optional IP reputation services
  - Key behaviors: Country allow-lists, subnet checks, VPN/proxy heuristics, immediate revocation on critical compromise signals.
  - Tests: Geo rule enforcement and proxy/VPN heuristics tests.

### Phase 4 (Observability & Hardening - In Progress)

Phase 4 focuses on telemetry, external integrations, workload identities, and resilience testing.

- Audit logging to Elasticsearch
  - Purpose: Immutable, filterable forensic logs for all critical system actions.
  - Files: `src/audit/index.ts`, integration with `src/logger/index.ts` streaming into ES
  - Key behaviors: Append-only store, index mappings for fast queries (actor, action, timestamps, device metadata), retention & export policies.
  - Security: Mask sensitive fields in logs, ensure log pipeline integrity and access controls to ES.
  - Tests: Verify log entries created for each critical action and indexed into ES (integration test with test ES instance).

- Shared Signals Framework (SSF)
  - Purpose: Full bidirectional SSF integration to receive provider compromise signals and transmit local signals upstream.
  - Files: `src/ssf/receiver.ts`, `src/ssf/sender.ts`, webhook endpoint `POST /ssf/events`
  - Key behaviors: Accept SET (Security Event Token) payloads, validate signatures, map events to sessions/users, trigger automated revocation or alerts, and transmit local SETs for critical events.
  - Tests: Verify SET parsing, signature validation, and automated actions on simulated signals.

- Workload identity credentials
  - Purpose: Short-lived, ephemeral credentials for non-human identities (CI, agents, AI workloads) with least-privilege scopes.
  - Files: `src/workload/index.ts`, `src/api/routes/workload.routes.ts`
  - Key behaviors: Issue scoped tokens with short TTLs, rotate secrets, provide audit trail for all workload actions, support token exchange flows.
  - Security: Enforce usage policies, IP and time restrictions for workload tokens, and strong rotation policies.
  - Tests: Token issuance, rotation, scope enforcement, and TTL expiry tests.

- Security headers middleware & hardening
  - Purpose: Enforce HTTP headers and runtime hardening (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy).
  - Files: `src/middleware/securityHeaders.ts`, integrated into `src/api/server.ts`
  - Tests: Verify headers are returned, CSP coverage tests.

- Load and chaos testing
  - Purpose: Validate resilience under load and failure modes (DB failover, Redis outage, network partition, event flood).
  - Tools: k6 or Artillery for load tests, Chaos Toolkit for fault injection, custom scripts for session revocation across nodes.
  - Tests: Authenticate at scale, refresh token storms, session revocation cascade, rate limiter efficacy, and SSF flood handling.

## 🧪 Testing

```bash
# Run all tests
bun run test

# Watch mode
bun run test:watch

# Coverage report
bun run test:coverage

# Run specific test file
bun run test src/__tests__/unit/token.test.ts
```

## 📊 Monitoring

### Elasticsearch / Kibana

Audit logs are automatically indexed in Elasticsearch:

- **Index Pattern**: `zeroauth-audit-YYYY-MM-DD`
- **Access**: http://localhost:5601

Create dashboards to monitor:

- Authentication success/failure rates
- MFA adoption
- Access denied patterns
- Device fingerprint anomalies
- Rate limit violations

### Application Logs

JSON logs are streamed to Elasticsearch:

```bash
# Check logs in Kibana
# Index Pattern: zeroauth-logs-YYYY-MM-DD
```

## 🔒 Security Best Practices

1. **Never commit `.env` files** - Use `.env.example` as template
2. **Rotate encryption keys regularly** - Set `CSFLE_KEY_ROTATION_DAYS`
3. **Use strong random secrets** - Min 32 bytes for TOKEN_SECRET_HEX
4. **Enable HTTPS in production** - Don't run over HTTP
5. **Monitor audit logs continuously** - Set up Elasticsearch alerts
6. **Keep dependencies updated** - Run `npm audit` regularly

## 📚 API Documentation

Coming in Phase 2. Will include:

- OpenAPI/Swagger spec
- Endpoint documentation
- Request/response examples
- OAuth flow diagrams
- WebAuthn registration guide

## 🤝 Contributing

1. Follow TypeScript strict mode
2. Add tests for new features
3. Update CHANGELOG
4. Run `npm run lint` and `npm run format` before committing

## 📝 License

[Add your license here]

## 🆘 Troubleshooting

### MongoDB Connection Issues

```bash
# Check MongoDB logs
docker-compose logs mongodb

# Verify connection
docker-compose exec mongodb mongosh -u admin -p password
```

### CSFLE Key Errors

```bash
# Regenerate encryption keys
openssl rand -hex 32 > .env  # Update TOKEN_SECRET_HEX and CSFLE_MASTER_KEY_HEX
docker-compose restart zeroauth
```

### Rate Limiting Not Working

Ensure Redis is running and accessible:

```bash
docker-compose exec redis redis-cli ping
```

## 📞 Support

For issues and questions:

- GitHub Issues: [repo/issues]
- Documentation: [docs link]
- Security: mas.arafat.dev@gmail.com
