# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-20

### Added - Phase 1: Foundation & Configuration

#### Configuration Management
- Environment-based configuration loader with validation
- Support for Bun.js and Node.js runtimes
- OAuth provider configuration (Google, Facebook, GitHub, Apple)
- MFA channel configuration (Email, SMS, WhatsApp, Telegram)
- Rate limiting configuration (in-memory, Redis, IP-based)
- Geofencing configuration with country and IP range support
- Elasticsearch integration configuration
- Structured logging configuration (JSON or text format)

#### Database & Persistence
- MongoDB connection layer with connection pooling
- Health check endpoints for database monitoring
- TTL index support for automatic document expiry
- Mongoose schema definitions for all core entities
- CSFLE integration hooks for transparent encryption

#### Encryption & Security
- CSFLE (Client-Side Field Level Encryption) manager
- Key versioning system for secure key rotation
- HKDF-based key derivation
- AES-256-GCM encryption with authenticated decryption
- Mongoose plugin for transparent field-level encryption
- Support for encrypting sensitive fields (email, phone, MFA secrets, OAuth tokens)

#### Logging & Observability
- Structured JSON logging with correlation IDs
- Log level filtering (debug, info, warn, error)
- Elasticsearch stream integration
- Audit logging helper for security-sensitive operations
- Request context tracking (user, session, IP, user-agent)

#### Core Models
- User schema with CSFLE encryption
- Session schema with device fingerprinting and continuous eval context
- Role schema with hierarchical role support and ABAC conditions
- JIT Access schema for temporal privilege escalation
- Audit Log schema with forensic capabilities
- Refresh Token schema with rotation support
- OTP schema for MFA delivery channels

#### Core Services
- Token Service (PASETO v4.local implementation with AES-256-GCM)
- Authorization Engine (ABAC with role hierarchy and JIT support)
- Fingerprint Service (device fingerprinting with FNV-1a hashing)

#### Type System
- Central shared types definition
- TokenPayload, AccessTokenResponse types
- User, Role, Session, Device types
- Authorization context and result types
- OAuth and MFA types
- Error types with standardized error codes
- Workload identity and SSF types

#### Development Infrastructure
- TypeScript configuration with strict mode enabled
- ESLint configuration for code quality
- Prettier configuration for code formatting
- Vitest configuration for testing
- Bunfig.toml for Bun runtime configuration
- .gitignore with common exclusions
- .env.example with all configuration options

#### Deployment
- Dockerfile supporting both Bun and Node.js runtimes
- Multi-stage Docker build for optimized images
- Docker Compose setup with:
  - MongoDB service with persistent volumes
  - Redis service for distributed caching
  - Elasticsearch service for audit logs
  - Kibana service for log visualization
  - ZeroAuth API service with health checks

#### Documentation
- Comprehensive README with quick start guide
- Project structure documentation
- Configuration guide
- Architecture diagrams
- Troubleshooting section
- Security best practices

#### NPM Scripts
- `build` - TypeScript compilation
- `dev` - Development mode with hot reload (tsx watch)
- `start` - Production mode (Node.js)
- `test` - Run test suite (vitest)
- `test:watch` - Watch mode for tests
- `test:coverage` - Generate coverage reports
- `lint` - Lint TypeScript files
- `lint:fix` - Auto-fix linting issues
- `format` - Format code with Prettier
- `type-check` - TypeScript type checking without emitting

### Dependencies Added
- **Core:** mongoose@^8.3.0, @simplewebauthn/server@^10.0.0, otpauth@^9.3.0, qrcode@^1.5.3
- **Utilities:** nanoid@^5.0.7, geoip-lite@^1.4.10, ua-parser-js@^1.0.37, bcryptjs@^2.4.3, nodemailer@^6.9.13
- **API:** express@^4.18.2, helmet@^7.1.0, cors@^2.8.5
- **DevTools:** vitest@^1.0.0, @vitest/ui@^1.0.0, @vitest/coverage-v8@^1.0.0, eslint@^8.55.0, prettier@^3.1.0, tsx@^4.6.0

### Architecture
- Modular structure separating concerns (config, db, crypto, logger, models, services)
- Plugin-based encryption for Mongoose schemas
- Singleton pattern for configuration, logging, and encryption managers
- Type-safe throughout with strict TypeScript settings

### Security
- CSFLE for at-rest data protection
- Proper password hashing configuration (bcryptjs with configurable rounds)
- Secure random key generation
- Environment variable secrets management
- Audit logging infrastructure for forensics

---

## Upcoming Releases

### Phase 2 [Pending]
- REST API endpoints for authentication flows
- OAuth provider implementations
- MFA challenge and verification
- Request validation middleware
- Error handling and response formatting

### Phase 3 [Pending]
- Authentication middleware with token verification
- Device attestation and anomaly detection
- Continuous access evaluation middleware
- Rate limiting implementation (all three strategies)
- Temporal access control
- Geo-fencing enforcement

### Phase 4 [Pending]
- Elasticsearch integration for audit logs
- Shared Signals Framework (receive/transmit)
- Workload identity credential system
- Security headers middleware
- Load and chaos testing suite

---

## Notes

- Current version focuses on infrastructure and foundational components
- All encryption uses industry-standard algorithms (AES-256-GCM, HKDF)
- Database schema includes proper indexing for performance
- Audit logging designed for compliance (SOC2, ISO27001, GDPR)
- Code follows strict TypeScript conventions and security best practices
