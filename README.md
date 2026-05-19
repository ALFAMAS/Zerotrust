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
- [ ] REST API endpoints
- [ ] OAuth provider factory
- [ ] MFA channel implementations
- [ ] Request validation middleware

### Phase 3 (Middleware & Evaluation - Pending)
- [ ] Auth middleware (token verification)
- [ ] Device attestation middleware
- [ ] Continuous access evaluation
- [ ] Rate limiting (mixed strategy)
- [ ] Temporal access control
- [ ] Geo-fencing

### Phase 4 (Observability & Hardening - Pending)
- [ ] Audit logging to Elasticsearch
- [ ] Shared Signals Framework
- [ ] Workload identity credentials
- [ ] Security headers middleware
- [ ] Load and chaos testing

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
- Security: security@zeroauth.dev
