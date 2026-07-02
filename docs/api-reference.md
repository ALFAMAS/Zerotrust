# zerotrust API reference

_Generated from `src/api/openapi.json` (zerotrust API v1.0.0) — run `bun run docs:api` to refresh; do not edit by hand._

Live, interactive docs: **Swagger UI at `/docs`** (dev). Full request/response types: the generated **`@zerotrust/client`** SDK (`packages/client`). 🔒 = requires authentication.

**115 operations** across 20 groups.

> **Coverage note:** this lists the operations currently described in `openapi.json`. Coverage includes auth/admin/MFA/sessions/OAuth, organizations, billing, wallet, search, compliance, support, feedback, notifications, GDPR, regions, and API keys. Some lower-traffic admin/tools, webhook, tenant, and email-event routes may still require schema-level expansion; see `src/api/server.ts` for the full mounted surface.

## Contents

- [Admin](#admin) (16)
- [API Keys](#api-keys) (3)
- [Auth](#auth) (5)
- [Billing](#billing) (14)
- [Compliance](#compliance) (6)
- [Feedback](#feedback) (1)
- [GDPR](#gdpr) (3)
- [Health](#health) (1)
- [MFA](#mfa) (7)
- [Notifications](#notifications) (10)
- [OAuth](#oauth) (4)
- [Organizations](#organizations) (13)
- [Passkeys](#passkeys) (5)
- [Password Reset](#password-reset) (2)
- [Regions](#regions) (7)
- [Search](#search) (5)
- [Sessions](#sessions) (3)
- [Shared Signals](#shared-signals) (1)
- [Support](#support) (5)
- [Wallet](#wallet) (4)

## Admin

Administrative settings, user management, audit visibility, and privileged operator actions.

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

## API Keys

Developer API key listing, creation, and revocation.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/api-keys` | List API keys | 🔒 |
| POST | `/api-keys` | Create API key | 🔒 |
| DELETE | `/api-keys/{id}` | Revoke API key | 🔒 |

## Auth

Core account lifecycle: registration, login, token refresh, password reset, account linking, and user profile access.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| POST | `/auth/login` | Login with email and password |  |
| POST | `/auth/logout` | Revoke current session | 🔒 |
| POST | `/auth/logout/all` | Revoke all sessions for the authenticated user | 🔒 |
| POST | `/auth/register` | Register a new user |  |
| POST | `/auth/token/refresh` | Rotate refresh token and issue new access token |  |

## Billing

Stripe-backed subscriptions, checkout, portal, usage, pricing, tax, and VAT endpoints.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| POST | `/billing/cancel` | Cancel or pause subscription | 🔒 |
| POST | `/billing/change-plan` | Change subscription plan | 🔒 |
| POST | `/billing/checkout` | Create Stripe checkout session | 🔒 |
| GET | `/billing/currencies` | List supported billing currencies | 🔒 |
| POST | `/billing/portal` | Create Stripe billing portal session | 🔒 |
| GET | `/billing/pricing` | Get localized plan pricing | 🔒 |
| POST | `/billing/reactivate` | Reactivate subscription | 🔒 |
| GET | `/billing/subscription` | Get current subscription | 🔒 |
| GET | `/billing/tax-exemptions` | List tax exemptions | 🔒 |
| POST | `/billing/tax-exemptions` | Create tax exemption request | 🔒 |
| POST | `/billing/tax-exemptions/{id}/status` | Update tax exemption status | 🔒 |
| POST | `/billing/tax/quote` | Quote sales tax / VAT | 🔒 |
| GET | `/billing/usage` | Get current billing usage | 🔒 |
| GET | `/billing/vat/validate` | Validate VAT number | 🔒 |

## Compliance

SOC 2 readiness, controls, and risk-assessment workflows.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/compliance/risk-assessment/{year}` | Get annual risk assessment | 🔒 |
| POST | `/compliance/risk-assessment/{year}` | Create risk assessment item | 🔒 |
| PUT | `/compliance/risk-assessment/{year}/{riskId}` | Update risk assessment item | 🔒 |
| GET | `/compliance/soc2/controls` | List SOC 2 controls | 🔒 |
| PUT | `/compliance/soc2/controls/{controlId}` | Update SOC 2 control status | 🔒 |
| GET | `/compliance/soc2/readiness` | Get SOC 2 readiness summary | 🔒 |

## Feedback

Authenticated product feedback submission.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| POST | `/feedback` | Submit product feedback | 🔒 |

## GDPR

User privacy export, account deletion, and deletion-cancel endpoints.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| DELETE | `/gdpr/account` | Request account deletion | 🔒 |
| POST | `/gdpr/account/deletion/cancel` | Cancel pending account deletion | 🔒 |
| GET | `/gdpr/export` | Export authenticated user data | 🔒 |

## Health

Operational health and readiness endpoints used by monitors, load balancers, and deployments.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/healthz` | Health and dependency status |  |

## MFA

Multi-factor authentication setup and verification, including TOTP, Email OTP, and backup codes.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| POST | `/auth/mfa/backup-codes/redeem` | Redeem a backup code for authentication |  |
| POST | `/auth/mfa/backup-codes/regenerate` | Regenerate backup codes (invalidates existing ones) | 🔒 |
| POST | `/auth/mfa/otp/send` | Send Email OTP | 🔒 |
| POST | `/auth/mfa/otp/verify` | Verify channel OTP | 🔒 |
| POST | `/auth/mfa/totp/disable` | Disable TOTP (requires valid TOTP code) | 🔒 |
| POST | `/auth/mfa/totp/setup` | Initialize TOTP setup — returns secret and QR code | 🔒 |
| POST | `/auth/mfa/totp/verify` | Verify TOTP code and activate TOTP MFA | 🔒 |

## Notifications

In-app notifications, unread counts, preferences, SSE, and web-push subscriptions.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/notifications` | List notifications | 🔒 |
| POST | `/notifications/{id}/read` | Mark notification as read | 🔒 |
| GET | `/notifications/preferences` | Get notification preferences | 🔒 |
| PUT | `/notifications/preferences` | Update notification preferences | 🔒 |
| GET | `/notifications/push/public-key` | Get web-push public key | 🔒 |
| POST | `/notifications/push/subscribe` | Subscribe to web-push notifications | 🔒 |
| POST | `/notifications/push/unsubscribe` | Unsubscribe from web-push notifications | 🔒 |
| POST | `/notifications/read-all` | Mark all notifications as read | 🔒 |
| GET | `/notifications/sse` | Open notification SSE stream | 🔒 |
| GET | `/notifications/unread-count` | Get unread notification count | 🔒 |

## OAuth

Social sign-in and provider callback flows for Google, GitHub, Apple, and Facebook.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/auth/oauth/{provider}/authorize` | Begin OAuth authorization flow (returns the provider's authorize URL) |  |
| GET | `/auth/oauth/{provider}/callback` | OAuth authorization code callback |  |
| POST | `/auth/oauth/exchange` | Redeem a one-time OAuth exchange code for tokens |  |
| POST | `/auth/oauth/state` | Generate an ephemeral OAuth state token (PKCE/nonce) |  |

## Organizations

Workspace, team, invitation, membership, and organization role-management endpoints.

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

WebAuthn / FIDO2 passkey registration and authentication flows.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| DELETE | `/auth/passkey/{credentialId}` | Remove a registered passkey | 🔒 |
| POST | `/auth/passkey/authenticate` | Complete WebAuthn authentication |  |
| POST | `/auth/passkey/authenticate/options` | Get WebAuthn authentication options |  |
| POST | `/auth/passkey/register` | Complete WebAuthn registration | 🔒 |
| POST | `/auth/passkey/register/options` | Get WebAuthn registration options | 🔒 |

## Password Reset

Password reset request, verification, and completion endpoints.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| POST | `/auth/password-reset/confirm` | Confirm password reset with OTP |  |
| POST | `/auth/password-reset/request` | Request a password reset OTP |  |

## Regions

Custom domain resolution, region health, geo-routing, branding, domains, and data residency.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/regions/for-country` | Resolve storage region for country |  |
| GET | `/regions/health` | Get region health |  |
| GET | `/regions/orgs/{orgId}/branding` | Get organization branding | 🔒 |
| PUT | `/regions/orgs/{orgId}/branding` | Update organization branding | 🔒 |
| PUT | `/regions/orgs/{orgId}/domain` | Set organization custom domain | 🔒 |
| PUT | `/regions/orgs/{orgId}/region` | Set organization data residency region | 🔒 |
| GET | `/regions/resolve` | Resolve organization by custom domain |  |

## Search

Full-text and ranked smart search plus indexing operations.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/search` | Search indexed resources | 🔒 |
| POST | `/search/index` | Index a searchable document | 🔒 |
| DELETE | `/search/index/{type}/{id}` | Remove an indexed document | 🔒 |
| GET | `/search/provider` | Get search provider status | 🔒 |
| GET | `/search/smart` | Ranked smart search | 🔒 |

## Sessions

Authenticated session listing, revocation, and device/session lifecycle controls.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/sessions` | List active sessions for authenticated user | 🔒 |
| DELETE | `/sessions` | Revoke all other sessions (keep current) | 🔒 |
| DELETE | `/sessions/{id}` | Revoke a specific session | 🔒 |

## Shared Signals

SSF security event receiver endpoints for cross-system identity and risk signals.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| POST | `/ssf/events` | Receive a Security Event Token (SET) from a provider |  |

## Support

Support ticket and message workflows.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/support` | List support tickets | 🔒 |
| POST | `/support` | Create support ticket | 🔒 |
| GET | `/support/{id}` | Get support ticket | 🔒 |
| PATCH | `/support/{id}` | Update support ticket | 🔒 |
| POST | `/support/{id}/messages` | Add support ticket message | 🔒 |

## Wallet

Wallet balance, transactions, top-up, and spend operations.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/wallet` | Get wallet balance | 🔒 |
| POST | `/wallet/spend` | Spend wallet balance | 🔒 |
| POST | `/wallet/top-up` | Top up wallet | 🔒 |
| GET | `/wallet/transactions` | List wallet transactions | 🔒 |

