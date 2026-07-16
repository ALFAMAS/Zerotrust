# Changelog

All notable changes to zerotrust are documented here.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and [Conventional Commits](https://www.conventionalcommits.org/).


## [1.11.0](https://github.com/ALFAMAS/Zerotrust/compare/v1.10.0...v1.11.0) (2026-07-16)

## [1.10.0](https://github.com/ALFAMAS/Zerotrust/compare/v1.9.0...v1.10.0) (2026-07-16)

## [1.9.0](https://github.com/ALFAMAS/Zerotrust/compare/v1.8.1...v1.9.0) (2026-07-16)

## [1.8.1](https://github.com/ALFAMAS/Zerotrust/compare/v1.8.0...v1.8.1) (2026-07-16)

## [1.8.0](https://github.com/ALFAMAS/Zerotrust/compare/v1.7.0...v1.8.0) (2026-07-15)

## [1.7.0](https://github.com/ALFAMAS/Zerotrust/compare/v1.6.1...v1.7.0) (2026-07-14)

## [1.6.1](https://github.com/ALFAMAS/Zerotrust/compare/v1.6.0...v1.6.1) (2026-07-14)

## [1.6.0](https://github.com/ALFAMAS/Zerotrust/compare/v1.5.0...v1.6.0) (2026-07-13)

## [1.5.0](https://github.com/ALFAMAS/Zerotrust/compare/v1.4.0...v1.5.0) (2026-07-11)

## [1.4.0](https://github.com/ALFAMAS/Zerotrust/compare/v1.3.0...v1.4.0) (2026-07-11)

## [1.3.0](https://github.com/ALFAMAS/Zerotrust/compare/v1.2.1...v1.3.0) (2026-07-11)

## [1.2.1](https://github.com/ALFAMAS/Zerotrust/compare/v1.2.0...v1.2.1) (2026-07-11)

## [1.2.0](https://github.com/ALFAMAS/Zerotrust/compare/v1.1.1...v1.2.0) (2026-07-09)

## [1.1.1](https://github.com/ALFAMAS/Zerotrust/compare/v1.1.0...v1.1.1) (2026-07-09)

## [1.1.0](https://github.com/ALFAMAS/Zerotrust/compare/v1.0.2...v1.1.0) (2026-07-09)

## [1.0.2](https://github.com/ALFAMAS/Zerotrust/compare/v1.0.1...v1.0.2) (2026-07-09)

## [1.0.1](https://github.com/ALFAMAS/Zerotrust/compare/v1.0.0...v1.0.1) (2026-07-09)

## 1.0.0 (2026-07-09)

# Changelog

All notable changes to zerotrust are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
and [Conventional Commits](https://www.conventionalcommits.org/).

Releases are automated via [semantic-release](https://github.com/semantic-release/semantic-release);
each release populates this file with generated entries. For the current feature
status (shipped vs. pending), see [`docs/project/shipped.md`](./docs/project/shipped.md) and [`docs/project/todo.md`](./docs/project/todo.md).

## Recent work (2026-07-01)

- **M1** — `as any` casts reduced 213 → 3 (documented exceptions); 3 real bugs
  found and fixed along the way (`.rowCount`/`.count` mismatch in data retention,
  email suppression, and session revocation; lifecycle-email metadata-wipe).
- **M2** — Notification dispatcher refactored to a plugin/capability
  (`NotificationAdapter`) pattern with isolated adapters per provider.
- **H3** — UI test harness (happy-dom + Testing Library) grown 11 → 58 tests.
- **MFA/WebAuthn route tests** — 53 new route-level tests for the three
  previously-untested security-critical route files. Full suite: **826 tests
  (94 files)**. Build green.
