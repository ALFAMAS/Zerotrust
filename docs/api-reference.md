# zerotrust API reference

_Generated from `src/api/openapi.json` (zerotrust API v1.0.0) — run `bun run docs:api` to refresh; do not edit by hand._

Live, interactive docs: **Swagger UI at `/docs`** (dev). Full request/response types: the generated **`@zerotrust/client`** SDK (`packages/client`). 🔒 = requires authentication.

**57 operations** across 10 groups.

> **Coverage note:** this lists the operations currently described in `openapi.json` (auth/admin/MFA/sessions/OAuth + organizations). Several mounted route modules — billing, wallet, search, collaboration, compliance, etc. — are not yet in the spec; see the [README API overview](../README.md#api-overview) and `src/api/server.ts` for the full mounted surface. Expanding `openapi.json` to the whole API (so the SDK + this reference cover it) is tracked as an Integration-Completion (D5) follow-up.

## Contents

- [Admin](#admin) (16)
- [Auth](#auth) (5)
- [Health](#health) (1)
- [MFA](#mfa) (7)
- [OAuth](#oauth) (4)
- [Organizations](#organizations) (13)
- [Passkeys](#passkeys) (5)
- [Password Reset](#password-reset) (2)
- [Sessions](#sessions) (3)
- [Shared Signals](#shared-signals) (1)

## Admin

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/admin/audit-logs` | Query audit log (admin only) | 🔒 |
| GET | `/admin/jit-grants` | List JIT access grants (admin only) | 🔒 |
| DELETE | `/admin/jit-grants/{id}` | Revoke an approved JIT grant (admin only) | 🔒 |
| POST | `/admin/jit-grants/{id}/approve` | Approve a JIT grant request (admin only) | 🔒 |
| POST | `/admin/jit-grants/{id}/deny` | Deny a JIT grant request (admin only) | 🔒 |
| GET | `/admin/roles` | List all roles (admin only) | 🔒 |
| POST | `/admin/roles` | Create a new role (admin only) | 🔒 |
| DELETE | `/admin/sessions/{id}` | Revoke a specific session by ID (admin only) | 🔒 |
| GET | `/admin/users` | List all users (admin only) | 🔒 |
| GET | `/admin/users/{id}` | Get user by ID (admin only) | 🔒 |
| PATCH | `/admin/users/{id}` | Update user status, roles, or displayName (admin only) | 🔒 |
| DELETE | `/admin/users/{id}` | Soft-delete user and revoke all sessions (admin only) | 🔒 |
| POST | `/admin/users/{id}/roles` | Assign role to user (admin only) | 🔒 |
| DELETE | `/admin/users/{id}/roles/{roleName}` | Remove role from user (admin only) | 🔒 |
| GET | `/admin/users/{id}/sessions` | List all sessions for a user (admin only) | 🔒 |
| DELETE | `/admin/users/{id}/sessions` | Revoke all sessions for a user (admin only) | 🔒 |

## Auth

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| POST | `/auth/login` | Login with email and password |  |
| POST | `/auth/logout` | Revoke current session | 🔒 |
| POST | `/auth/logout/all` | Revoke all sessions for the authenticated user | 🔒 |
| POST | `/auth/register` | Register a new user |  |
| POST | `/auth/token/refresh` | Rotate refresh token and issue new access token |  |

## Health

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/healthz` | Health and dependency status |  |

## MFA

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| POST | `/auth/mfa/backup-codes/redeem` | Redeem a backup code for authentication |  |
| POST | `/auth/mfa/backup-codes/regenerate` | Regenerate backup codes (invalidates existing ones) | 🔒 |
| POST | `/auth/mfa/otp/send` | Send OTP via email, SMS, WhatsApp, or Telegram | 🔒 |
| POST | `/auth/mfa/otp/verify` | Verify channel OTP | 🔒 |
| POST | `/auth/mfa/totp/disable` | Disable TOTP (requires valid TOTP code) | 🔒 |
| POST | `/auth/mfa/totp/setup` | Initialize TOTP setup — returns secret and QR code | 🔒 |
| POST | `/auth/mfa/totp/verify` | Verify TOTP code and activate TOTP MFA | 🔒 |

## OAuth

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/auth/oauth/{provider}/authorize` | Begin OAuth authorization flow (returns the provider's authorize URL) |  |
| GET | `/auth/oauth/{provider}/callback` | OAuth authorization code callback |  |
| POST | `/auth/oauth/exchange` | Redeem a one-time OAuth exchange code for tokens |  |
| POST | `/auth/oauth/state` | Generate an ephemeral OAuth state token (PKCE/nonce) |  |

## Organizations

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/orgs` | List organizations the current user belongs to | 🔒 |
| POST | `/orgs` | Create an organization (creator becomes owner) | 🔒 |
| GET | `/orgs/{orgId}` | Get an organization | 🔒 |
| PUT | `/orgs/{orgId}` | Update organization settings | 🔒 |
| DELETE | `/orgs/{orgId}` | Delete an organization | 🔒 |
| GET | `/orgs/{orgId}/invites` | List pending invites | 🔒 |
| POST | `/orgs/{orgId}/invites` | Invite a user by email | 🔒 |
| DELETE | `/orgs/{orgId}/invites/{inviteId}` | Revoke a pending invite | 🔒 |
| GET | `/orgs/{orgId}/members` | List organization members | 🔒 |
| DELETE | `/orgs/{orgId}/members/{userId}` | Remove a member (cannot remove the last owner) | 🔒 |
| GET | `/orgs/{orgId}/security/policy` | Get the org security policy (session/device/geo limits) | 🔒 |
| PUT | `/orgs/{orgId}/security/policy` | Update the org security policy | 🔒 |
| POST | `/orgs/{orgId}/transfer` | Transfer organization ownership | 🔒 |

## Passkeys

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| DELETE | `/auth/passkey/{credentialId}` | Remove a registered passkey | 🔒 |
| POST | `/auth/passkey/authenticate` | Complete WebAuthn authentication |  |
| POST | `/auth/passkey/authenticate/options` | Get WebAuthn authentication options |  |
| POST | `/auth/passkey/register` | Complete WebAuthn registration | 🔒 |
| POST | `/auth/passkey/register/options` | Get WebAuthn registration options | 🔒 |

## Password Reset

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| POST | `/auth/password-reset/confirm` | Confirm password reset with OTP |  |
| POST | `/auth/password-reset/request` | Request a password reset OTP |  |

## Sessions

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/sessions` | List active sessions for authenticated user | 🔒 |
| DELETE | `/sessions` | Revoke all other sessions (keep current) | 🔒 |
| DELETE | `/sessions/{id}` | Revoke a specific session | 🔒 |

## Shared Signals

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| POST | `/ssf/events` | Receive a Security Event Token (SET) from a provider |  |

