# Graph Report - .  (2026-05-20)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 406 nodes · 508 edges · 23 communities (21 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `95b5b440`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 31 edges
2. `ZeroAuth - Zero-Trust Authentication & Authorization System` - 15 edges
3. `ZeroAuth - Zero-Trust Authentication & Authorization System` - 15 edges
4. `getConfig()` - 14 edges
5. `Logger` - 14 edges
6. `CSFLEManager` - 13 edges
7. `Added - Phase 1: Foundation & Configuration` - 12 edges
8. `rules` - 11 edges
9. `scripts` - 11 edges
10. `AuthorizationEngine` - 11 edges

## Surprising Connections (you probably didn't know these)
- `initializeZeroAuth()` --calls--> `initializeCSFLE()`  [INFERRED]
  src/index.ts → src/crypto/csfle.ts
- `shutdownZeroAuth()` --calls--> `getLogger()`  [INFERRED]
  src/index.ts → src/logger/index.ts
- `shutdownZeroAuth()` --calls--> `closeDatabase()`  [INFERRED]
  src/index.ts → src/db/index.ts
- `initializeZeroAuth()` --calls--> `getConfig()`  [INFERRED]
  src/index.ts → src/config/index.ts
- `initializeZeroAuth()` --calls--> `initializeLogger()`  [INFERRED]
  src/index.ts → src/logger/index.ts

## Communities (23 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (44): 📚 API Documentation, Application Logs, 🏗️ Architecture, Authentication, Authentication Flow, Authorization, Authorization Flow, code:bash (# Clone and setup) (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (43): 📚 API Documentation, Application Logs, 🏗️ Architecture, Authentication, Authentication Flow, Authorization, Authorization Flow, code:bash (# Clone and setup) (+35 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (32): compilerOptions, allowImportingTsExtensions, allowSyntheticDefaultImports, alwaysStrict, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames (+24 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (14): CSFLEManager, csflEncryptionPlugin(), decryptFieldsInDoc(), EncryptionKeyVersion, getCSFLE(), initializeCSFLE(), fieldsToEncrypt, OAuthProviderSchema (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (29): dependencies, bcryptjs, cors, express, geoip-lite, helmet, mongoose, nanoid (+21 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (16): DEFAULT_CONFIG, getConfig(), loadConfig(), validateConfig(), closeDatabase(), initializeDatabase(), setupConnectionListeners(), createChildLogger() (+8 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (22): [1.0.0] - 2026-05-20, Added - Phase 1: Foundation & Configuration, Architecture, Changelog, Configuration Management, Core Models, Core Services, Database & Persistence (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (18): JITModel, RoleModel, ABACCondition, AccessTokenResponse, AuditLog, AuthzContext, AuthzResult, JITAccessRequest (+10 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (18): extends, ignorePatterns, parser, parserOptions, ecmaVersion, project, sourceType, rules (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (17): ABACConditionSchema, AuditDocument, AuditSchema, DeviceFingerprintSchema, JITDocument, JITSchema, OTPDocument, OTPModel (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (17): devDependencies, eslint, prettier, tsx, @types/bcryptjs, @types/cors, @types/express, @types/node (+9 more)

### Community 11 - "Community 11"
Cohesion: 0.20
Nodes (3): auditLog(), getLogger(), Logger

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (5): logger, Request, Session, TokenPayload, ZeroAuthError

### Community 13 - "Community 13"
Cohesion: 0.22
Nodes (9): authzEngine, ContinuousEvalConfig, continuousEvalMiddleware(), DEFAULT_CONFIG, extractAction(), extractResource(), logger, Request (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.20
Nodes (10): paths, @/*, @config, @crypto, @db, @logger, @middleware, @models (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (7): arrowParens, bracketSpacing, printWidth, semi, singleQuote, tabWidth, trailingComma

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (4): DeviceAttestation, logger, SessionModel, ErrorCodes

### Community 18 - "Community 18"
Cohesion: 0.25
Nodes (8): code:bash (# Generate 32-byte random key (64 hex chars)), code:block5 (TOKEN_SECRET_HEX=<32-byte random key>), code:block6 (OAUTH_GOOGLE_CLIENT_ID=your-client-id), code:block7 (MFA_EMAIL_ENABLED=true), 🔐 Configuration, Critical Security Keys, MFA Channels, OAuth Setup

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (3): FingerprintInput, FingerprintService, DeviceFingerprint

### Community 20 - "Community 20"
Cohesion: 0.29
Nodes (7): code:bash (# Check MongoDB logs), code:bash (# Regenerate encryption keys), code:bash (docker-compose exec redis redis-cli ping), CSFLE Key Errors, MongoDB Connection Issues, Rate Limiting Not Working, 🆘 Troubleshooting

## Knowledge Gaps
- **231 isolated node(s):** `parser`, `ecmaVersion`, `sourceType`, `project`, `extends` (+226 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Logger` connect `Community 11` to `Community 5`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `AuthorizationEngine` connect `Community 14` to `Community 13`, `Community 7`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `parser`, `ecmaVersion`, `sourceType` to the rest of the system?**
  _231 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.09425287356321839 - nodes in this community are weakly interconnected._