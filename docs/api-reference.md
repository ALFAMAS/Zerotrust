# zerotrust API reference

_Generated from `src/api/openapi.json` (zerotrust API v1.0.0) — run `bun run docs:api` to refresh; do not edit by hand._

Live, interactive docs: **Swagger UI at `/docs`** (dev). Full request/response types: the generated **`@zerotrust/client`** SDK (`packages/client`). 🔒 = requires authentication.

**199 operations** across 22 groups.

> **Coverage note:** this lists every operation described in `openapi.json`, aligned with the mounted route surface in `src/api/server.ts` (198 backend routes). Request/response schemas for lower-traffic admin, webhook, tenant, and ops endpoints use minimal stubs; enrich per-route schemas as SDK consumers need them.

## Contents

- [Admin](#admin) (47)
- [API Keys](#api-keys) (3)
- [Auth](#auth) (20)
- [Billing](#billing) (15)
- [Compliance](#compliance) (6)
- [Feedback](#feedback) (1)
- [GDPR](#gdpr) (3)
- [Health](#health) (9)
- [MFA](#mfa) (12)
- [Notifications](#notifications) (17)
- [OAuth](#oauth) (4)
- [Organizations](#organizations) (22)
- [Passkeys](#passkeys) (7)
- [Password Reset](#password-reset) (2)
- [Regions](#regions) (4)
- [Search](#search) (5)
- [Sessions](#sessions) (3)
- [Shared Signals](#shared-signals) (1)
- [Support](#support) (5)
- [Unsubscribe](#unsubscribe) (1)
- [Wallet](#wallet) (4)
- [Webhooks](#webhooks) (8)

## Admin

Administrative settings, user management, audit visibility, and privileged operator actions.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/admin/access-reviews` | Get access-reviews (/admin/access-reviews) | 🔒 |
| POST | `/admin/access-reviews` | Create access-reviews (/admin/access-reviews) | 🔒 |
| GET | `/admin/access-reviews/{id}` | Get id (/admin/access-reviews/{id}) | 🔒 |
| POST | `/admin/access-reviews/{id}/complete` | Create complete (/admin/access-reviews/{id}/complete) | 🔒 |
| PATCH | `/admin/access-reviews/{id}/items/{itemId}` | Update itemId (/admin/access-reviews/{id}/items/{itemId}) | 🔒 |
| GET | `/admin/anomaly/baseline/{userId}` | Get userId (/admin/anomaly/baseline/{userId}) | 🔒 |
| DELETE | `/admin/anomaly/baseline/{userId}` | Delete userId (/admin/anomaly/baseline/{userId}) | 🔒 |
| GET | `/admin/anomaly/baselines` | Get baselines (/admin/anomaly/baselines) | 🔒 |
| POST | `/admin/anomaly/score` | Create score (/admin/anomaly/score) | 🔒 |
| GET | `/admin/attachments` | Get attachments (/admin/attachments) | 🔒 |
| POST | `/admin/attachments/upload` | Create upload (/admin/attachments/upload) | 🔒 |
| GET | `/admin/audit-logs` | Query audit log (admin only) | 🔒 |
| GET | `/admin/audit-logs/verify` | Get verify (/admin/audit-logs/verify) | 🔒 |
| GET | `/admin/audit/export` | Get export (/admin/audit/export) | 🔒 |
| POST | `/admin/broadcast` | Create broadcast (/admin/broadcast) | 🔒 |
| GET | `/admin/feedback` | Get feedback (/admin/feedback) | 🔒 |
| GET | `/admin/jit-grants` | List JIT access grants (admin only) | 🔒 |
| DELETE | `/admin/jit-grants/{id}` | Revoke an approved JIT grant (admin only) | 🔒 |
| POST | `/admin/jit-grants/{id}/approve` | Approve a JIT grant request (admin only) | 🔒 |
| POST | `/admin/jit-grants/{id}/deny` | Deny a JIT grant request (admin only) | 🔒 |
| POST | `/admin/lifecycle-emails` | Create lifecycle-emails (/admin/lifecycle-emails) | 🔒 |
| GET | `/admin/revenue` | Get revenue (/admin/revenue) | 🔒 |
| GET | `/admin/roles` | List all roles (admin only) | 🔒 |
| POST | `/admin/roles` | Create a new role (admin only) | 🔒 |
| GET | `/admin/sessions` | Get sessions (/admin/sessions) | 🔒 |
| DELETE | `/admin/sessions/{id}` | Revoke a specific session by ID (admin only) | 🔒 |
| GET | `/admin/settings` | Get settings (/admin/settings) | 🔒 |
| PUT | `/admin/settings` | Update settings (/admin/settings) | 🔒 |
| GET | `/admin/slo` | Get slo (/admin/slo) | 🔒 |
| GET | `/admin/stats` | Get stats (/admin/stats) | 🔒 |
| POST | `/admin/uploads/presigned` | Create presigned (/admin/uploads/presigned) | 🔒 |
| GET | `/admin/users` | List all users (admin only) | 🔒 |
| GET | `/admin/users/{id}` | Get user by ID (admin only) | 🔒 |
| PATCH | `/admin/users/{id}` | Update user status, roles, or displayName (admin only) | 🔒 |
| DELETE | `/admin/users/{id}` | Soft-delete user and revoke all sessions (admin only) | 🔒 |
| POST | `/admin/users/{id}/force-logout` | Create force-logout (/admin/users/{id}/force-logout) | 🔒 |
| POST | `/admin/users/{id}/impersonate` | Create impersonate (/admin/users/{id}/impersonate) | 🔒 |
| POST | `/admin/users/{id}/legal-hold` | Create legal-hold (/admin/users/{id}/legal-hold) | 🔒 |
| PUT | `/admin/users/{id}/plan` | Update plan (/admin/users/{id}/plan) | 🔒 |
| POST | `/admin/users/{id}/roles` | Assign role to user (admin only) | 🔒 |
| DELETE | `/admin/users/{id}/roles/{roleName}` | Remove role from user (admin only) | 🔒 |
| PUT | `/admin/users/{id}/segment` | Update segment (/admin/users/{id}/segment) | 🔒 |
| GET | `/admin/users/{id}/sessions` | List all sessions for a user (admin only) | 🔒 |
| DELETE | `/admin/users/{id}/sessions` | Revoke all sessions for a user (admin only) | 🔒 |
| GET | `/admin/users/export` | Get export (/admin/users/export) | 🔒 |
| GET | `/admin/users/segments` | Get segments (/admin/users/segments) | 🔒 |
| GET | `/admin/webhooks/{webhookId}/deliveries` | Get deliveries (/admin/webhooks/{webhookId}/deliveries) | 🔒 |

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
| POST | `/auth/magic-link/send` | Create send (/auth/magic-link/send) |  |
| GET | `/auth/magic-link/verify` | Get verify (/auth/magic-link/verify) |  |
| POST | `/auth/magic-link/verify` | Create verify (/auth/magic-link/verify) |  |
| GET | `/auth/me` | Get me (/auth/me) | 🔒 |
| PATCH | `/auth/me` | Update me (/auth/me) | 🔒 |
| POST | `/auth/me/avatar` | Create avatar (/auth/me/avatar) | 🔒 |
| POST | `/auth/me/email` | Create email (/auth/me/email) | 🔒 |
| POST | `/auth/me/link` | Create link (/auth/me/link) | 🔒 |
| POST | `/auth/me/nps` | Create nps (/auth/me/nps) | 🔒 |
| GET | `/auth/me/nps/should-prompt` | Get should-prompt (/auth/me/nps/should-prompt) | 🔒 |
| POST | `/auth/me/onboarding-complete` | Create onboarding-complete (/auth/me/onboarding-complete) | 🔒 |
| DELETE | `/auth/oauth/{provider}` | Delete provider (/auth/oauth/{provider}) | 🔒 |
| GET | `/auth/pow/challenge` | Get challenge (/auth/pow/challenge) |  |
| POST | `/auth/register` | Register a new user |  |
| POST | `/auth/token/refresh` | Rotate refresh token and issue new access token |  |
| POST | `/auth/verify-email` | Create verify-email (/auth/verify-email) |  |
| POST | `/auth/verify-email/resend` | Create resend (/auth/verify-email/resend) |  |

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
| POST | `/billing/webhook` | Stripe billing webhook (signature-verified) |  |

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
| GET | `/.well-known/security.txt` | Get security.txt (/.well-known/security.txt) |  |
| GET | `/api/versions` | Get versions (/api/versions) |  |
| GET | `/health` | Get health (/health) |  |
| GET | `/healthz` | Health and dependency status |  |
| GET | `/metrics` | Get metrics (/metrics) |  |
| GET | `/protected` | Get protected (/protected) |  |
| GET | `/security.txt` | Get security.txt (/security.txt) |  |
| GET | `/status` | Get status (/status) |  |
| GET | `/status/stream` | Get stream (/status/stream) |  |

## MFA

Multi-factor authentication setup and verification, including TOTP, Email OTP, and backup codes.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| POST | `/auth/login/mfa` | Create mfa (/auth/login/mfa) |  |
| POST | `/auth/mfa/backup-codes/redeem` | Redeem a backup code for authentication |  |
| POST | `/auth/mfa/backup-codes/regenerate` | Regenerate backup codes (invalidates existing ones) | 🔒 |
| POST | `/auth/mfa/otp/send` | Send Email OTP | 🔒 |
| POST | `/auth/mfa/otp/verify` | Verify channel OTP | 🔒 |
| DELETE | `/auth/mfa/totp` | Delete totp (/auth/mfa/totp) | 🔒 |
| POST | `/auth/mfa/totp/disable` | Disable TOTP (requires valid TOTP code) | 🔒 |
| POST | `/auth/mfa/totp/setup` | Initialize TOTP setup — returns secret and QR code | 🔒 |
| POST | `/auth/mfa/totp/verify` | Verify TOTP code and activate TOTP MFA | 🔒 |
| POST | `/auth/verify/challenge` | Create challenge (/auth/verify/challenge) | 🔒 |
| POST | `/auth/verify/respond` | Create respond (/auth/verify/respond) | 🔒 |
| GET | `/auth/verify/status` | Get status (/auth/verify/status) | 🔒 |

## Notifications

In-app notifications, unread counts, preferences, SSE, and web-push subscriptions.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/admin/notifications/channels` | Get channels (/admin/notifications/channels) | 🔒 |
| POST | `/admin/notifications/channels` | Create channels (/admin/notifications/channels) | 🔒 |
| PATCH | `/admin/notifications/channels/{id}` | Update id (/admin/notifications/channels/{id}) | 🔒 |
| DELETE | `/admin/notifications/channels/{id}` | Delete id (/admin/notifications/channels/{id}) | 🔒 |
| POST | `/admin/notifications/channels/{id}/test` | Create test (/admin/notifications/channels/{id}/test) | 🔒 |
| GET | `/admin/notifications/config` | Get config (/admin/notifications/config) | 🔒 |
| POST | `/admin/notifications/test` | Create test (/admin/notifications/test) | 🔒 |
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

Social sign-in and provider callback flows for Google, GitHub, and Facebook.

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
| GET | `/jit/cross-tenant` | Get cross-tenant (/jit/cross-tenant) | 🔒 |
| POST | `/jit/cross-tenant` | Create cross-tenant (/jit/cross-tenant) | 🔒 |
| POST | `/jit/cross-tenant/{id}/approve` | Create approve (/jit/cross-tenant/{id}/approve) | 🔒 |
| POST | `/jit/cross-tenant/{id}/deny` | Create deny (/jit/cross-tenant/{id}/deny) | 🔒 |
| GET | `/jit/cross-tenant/incoming` | Get incoming (/jit/cross-tenant/incoming) | 🔒 |
| GET | `/jit/cross-tenant/status/{requestId}` | Get requestId (/jit/cross-tenant/status/{requestId}) | 🔒 |
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
| DELETE | `/orgs/invites/{inviteId}` | Decline (delete) one of the caller's own pending invites | 🔒 |
| POST | `/orgs/invites/accept` | Accept a pending org invite by token | 🔒 |
| GET | `/orgs/invites/mine` | List the authenticated user's pending org invites | 🔒 |

## Passkeys

WebAuthn / FIDO2 passkey registration and authentication flows.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| DELETE | `/auth/passkey/{credentialId}` | Remove a registered passkey | 🔒 |
| POST | `/auth/passkey/authenticate` | Complete WebAuthn authentication |  |
| POST | `/auth/passkey/authenticate/options` | Get WebAuthn authentication options |  |
| POST | `/auth/passkey/authenticate/verify` | Create verify (/auth/passkey/authenticate/verify) |  |
| POST | `/auth/passkey/register` | Complete WebAuthn registration | 🔒 |
| POST | `/auth/passkey/register/options` | Get WebAuthn registration options | 🔒 |
| POST | `/auth/passkey/register/verify` | Create verify (/auth/passkey/register/verify) |  |

## Password Reset

Password reset request, verification, and completion endpoints.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| POST | `/auth/password-reset/confirm` | Confirm password reset with OTP |  |
| POST | `/auth/password-reset/request` | Request a password reset OTP |  |

## Regions

Custom domain resolution and per-organization branding.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/regions/orgs/{orgId}/branding` | Get organization branding | 🔒 |
| PUT | `/regions/orgs/{orgId}/branding` | Update organization branding | 🔒 |
| PUT | `/regions/orgs/{orgId}/domain` | Set organization custom domain | 🔒 |
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

## Unsubscribe

Email unsubscribe landing (API/SDK-only). GET /auth/unsubscribe serves server-rendered HTML for one-click email opt-out links — no Next.js UI page.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/auth/unsubscribe` | Email unsubscribe landing (API-only HTML) |  |

## Wallet

Wallet balance, transactions, and top-up. POST /wallet/spend is API/SDK-only (programmatic debit for integrations — no dashboard UI).

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/wallet` | Get wallet balance | 🔒 |
| POST | `/wallet/spend` | Spend wallet balance (API/SDK-only) | 🔒 |
| POST | `/wallet/top-up` | Top up wallet | 🔒 |
| GET | `/wallet/transactions` | List wallet transactions | 🔒 |

## Webhooks

Outbound webhook endpoint registration, delivery history, and provider event receivers.

| Method | Path | Summary | Auth |
| --- | --- | --- | --- |
| GET | `/webhooks` | Get webhooks (/webhooks) | 🔒 |
| POST | `/webhooks` | Create webhooks (/webhooks) | 🔒 |
| GET | `/webhooks/{id}` | Get id (/webhooks/{id}) | 🔒 |
| PATCH | `/webhooks/{id}` | Update id (/webhooks/{id}) | 🔒 |
| DELETE | `/webhooks/{id}` | Delete id (/webhooks/{id}) | 🔒 |
| GET | `/webhooks/{id}/deliveries` | Get deliveries (/webhooks/{id}/deliveries) | 🔒 |
| POST | `/webhooks/{id}/ping` | Create ping (/webhooks/{id}/ping) | 🔒 |
| POST | `/webhooks/email/event` | Inbound email provider event webhook |  |

