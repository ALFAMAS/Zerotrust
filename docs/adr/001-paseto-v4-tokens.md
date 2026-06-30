# ADR 001: PASETO v4 for Access Tokens

**Status:** Accepted
**Date:** 2026-01 (initial), documented 2026-07-01
**Deciders:** Project maintainers

## Context

Authentication tokens are the most security-critical primitive in the system —
every API request depends on their integrity. We needed a stateless token format
for 1-hour access tokens that:

- Resists implementation mistakes common in JWT libraries ("alg=none",
  key-type confusion, signature-bypass by design).
- Runs on Bun, Node, and browsers (WebCrypto) with acceptable performance.
- Provides both confidentiality (payload encryption) and authentication
  (tamper detection).

## Decision

Use **PASETO v4.local** (XChaCha20 + keyed BLAKE2b with PAE) — a
specification-first, choice-less token format — implemented via `@noble/ciphers`
and `@noble/hashes`.

- **v4.local** (symmetric, authenticated encryption) — the shared-secret model
  fits a monolith where the API server that signs also verifies.
- **1-hour TTL** with short-lived opaque refresh tokens (rotated on use,
  SHA-256-hashed at rest).
- **No JWT anywhere.** The system never parses, issues, or references a JWT.

Bun/WebCrypto lacks native XChaCha20 and BLAKE2b, so the two missing primitives
come from the audited `@noble` packages; key splitting, PAE, Base64URL encoding,
and constant-time tag verification are implemented per the PASETO specification
and validated against the official `paseto-standard` test vectors in
`src/__tests__/paseto-v4.test.ts`.

## Alternatives considered

| Option | Why rejected |
|---|---|
| **JWT (RS256 / HS256)** | JWT libraries present a default-open algorithm-negotiation surface that has produced CVEs across every major ecosystem. Even the best libraries require `allowedAlgorithms` guardrails, and teams routinely misconfigure them. |
| **PASETO v4.public** | Asymmetric signing is unnecessary — the same process that mints tokens also verifies them. `v4.public` adds key-distribution complexity with no benefit in a monolith. |
| **Opaque-only (no stateless token)** | Every request would require a DB round-trip to resolve the session, adding latency and load. The 1-hour access token batching window amortises cost; the session DB remains authoritative for `lastActivityAt` and revocation. |
| **JWT with PASETO claims encoding** | Hybrid approach adds confusion about which spec governs, and JWT library surface remains. |

## Consequences

- **Positive:** No JWT footguns. Algorithm is baked into `v4.local` — there is
  no "alg" parameter to negotiate or confuse. Payloads are encrypted
  (confidentiality + integrity), not just signed.
- **Positive:** Token rotation is straightforward: dual-key window (accept-old +
  sign-new) → deploy → wait for old tokens to expire → drop old key.
- **Negative:** Bun/Node runtime difference — the custom implementation must
  remain correct across both runtimes; test vectors catch regressions.
- **Negative:** Third-party ecosystems overwhelmingly speak JWT. If we ever
  expose the API as an OAuth/OIDC provider, we would need a JWT translation
  layer at the boundary. This is deferred.

## References

- PASETO specification: https://github.com/paseto-standard/paseto-spec
- Implementation: `src/crypto/paseto-v4.ts`
- Tests: `src/__tests__/paseto-v4.test.ts`
- `@noble/ciphers`: https://github.com/paulmillr/noble-ciphers
- `@noble/hashes`: https://github.com/paulmillr/noble-hashes
