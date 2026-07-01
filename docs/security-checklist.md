# 100 Common Security Issues in Vibe-Coded Apps

Grouped by category. Categories are ordered roughly by real-world exploit frequency and impact. Items ~1–55 are where nearly all damage happens; the tail is long-tail.

---

## A. Authorization / Access Control — the #1 killer

1. IDOR: `/api/orders/123` returns any user's record, no ownership check.
2. Mass assignment: user sets `role: admin` / `isVerified: true` in the request body and the server trusts it.
3. Missing function-level authz: admin endpoints reachable by normal users.
4. Trusting client-supplied `user_id` / `role` / `tenant_id` instead of deriving from the session.
5. Horizontal privilege escalation across tenants (multi-tenant data leakage).
6. Row-level security (RLS) disabled or misconfigured (Supabase classic).
7. Admin routes "protected" only by being unlinked/obscure (security by obscurity).
8. Authz checked on read but not write (or vice versa).
9. No re-check of permissions on the object after fetch (TOCTOU).

## B. Authentication & Sessions

10. No auth at all on endpoints that require it ("logged in = safe" assumption).
11. Auth enforced only in the UI, not on the server.
12. JWT signature not verified, or `alg: none` accepted.
13. JWT secret hardcoded, weak, or committed to the repo.
14. Tokens never expire / absurd TTL with no refresh or revocation.
15. JWTs stored in `localStorage` (XSS-stealable) instead of httpOnly cookies.
16. No rate limiting on login → credential stuffing / brute force.
17. No account lockout or CAPTCHA after repeated failures.
18. Password reset tokens predictable, non-expiring, or reusable.
19. Email enumeration via different responses for "user exists" vs not.
20. No CSRF protection on cookie-based state-changing requests.
21. Session fixation: session ID not rotated on login.
22. Plaintext or fast-hash (MD5/SHA1) password storage instead of bcrypt/argon2/scrypt.
23. OAuth `state` param missing → CSRF on the OAuth flow.
24. OAuth `redirect_uri` not validated → token theft via open redirect.

## C. Secrets & Credentials

25. API keys / DB creds hardcoded in source.
26. Secrets committed to git history (still there after "deletion").
27. `.env` shipped to the client or served publicly.
28. Server secrets exposed in the client bundle (`NEXT_PUBLIC_` misuse).
29. Third-party secret keys (Stripe secret, OpenAI, etc.) called directly from the browser.
30. Same credentials reused across dev/staging/prod.
31. No rotation; long-lived static keys.
32. Cloud credentials with over-broad IAM scope (`*:*`).
33. App runtime connects to the DB with an admin/superuser account.
34. Default or sample credentials left in place.

## D. Injection

35. SQL injection via string concatenation (no parameterized queries).
36. NoSQL injection (Mongo `$where`, operator injection via untrusted JSON).
37. OS command injection (`exec`/`spawn` with user input).
38. Server-side template injection (SSTI).
39. LDAP / XPath injection.
40. Prompt injection into LLM features that have tool, DB, or filesystem access.
41. HTTP header / CRLF injection.
42. ORM raw-query escape hatch with concatenated input.

## E. Data Exposure

43. PII returned in responses beyond what the UI needs (over-fetching).
44. Internal fields (password hash, tokens, flags) serialized in responses.
45. Verbose errors / stack traces leaked to users.
46. Sensitive data in URL query params (logged everywhere downstream).
47. PII or secrets written to application logs.
48. No encryption at rest for sensitive fields.
49. Backups unencrypted or publicly accessible.
50. Debug endpoints / admin panels exposed in prod.
51. Source maps shipped to prod, exposing source.
52. `.git` directory served publicly.
53. Directory listing enabled on the web server.

## F. Input Validation

54. No server-side validation (trusting client validation only).
55. No length / size limits → resource exhaustion.
56. No type/schema validation on request bodies.
57. Unrestricted file upload (type, size, content unchecked).
58. XXE: XML parser resolves external entities.
59. Encoding / Unicode bypass of validation filters.

## G. API & Transport

60. No HTTPS / HTTP allowed / mixed content.
61. CORS `*` with credentials, or reflecting `Origin` blindly.
62. No rate limiting / throttling on any endpoint.
63. GraphQL introspection enabled + no query depth/cost limits.
64. Verbose API errors revealing schema or stack.
65. No request size limits → DoS.
66. Missing security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options).
67. Deprecated/old API versions left live and unpatched.

## H. Client-Side / Frontend

68. Stored or reflected XSS — unsanitized user content rendered as HTML.
69. `dangerouslySetInnerHTML` / `innerHTML` with untrusted data.
70. DOM-based XSS via `eval`, `Function`, or unsafe sinks.
71. Clickjacking — no frame-busting / X-Frame-Options.
72. Open redirect via unchecked `redirect` / `next` param.
73. Treating minified client code as "secret."
74. `postMessage` with `*` target origin / no origin check.

## I. Dependencies & Supply Chain

75. Outdated deps with known CVEs, never updated.
76. No lockfile / unpinned versions.
77. Installing hallucinated or typosquatted packages (LLM suggests a nonexistent pkg; an attacker registers it).
78. Copy-pasted vulnerable snippets from old tutorials.
79. Loading scripts from untrusted CDNs without SRI.
80. Unvetted transitive dependencies, no SBOM.

## J. Infrastructure / Deployment / Config

81. Database exposed to the public internet (`0.0.0.0`, no firewall).
82. Default ports / admin consoles open with no auth (Mongo, Redis, Elastic).
83. Cloud storage bucket public / world-readable.
84. Containers run as root.
85. Secrets baked into Docker images.
86. No network segmentation between services.
87. Debug mode on in production.
88. Permissive firewall / security-group rules.
89. No automated patching of the host OS.

## K. Cryptography

90. Custom / homegrown crypto.
91. Hardcoded encryption keys/IVs; ECB mode; static IV.
92. Weak randomness (`Math.random()`) for tokens/IDs.
93. Sequential / guessable IDs for sensitive resources.

## L. Business Logic / Abuse

94. No idempotency on payment/order endpoints → double-spend.
95. Price/total trusted from the client instead of recomputed server-side.
96. Coupon/credit logic abusable (negative quantities, stacking, replay).
97. Race conditions on balance/inventory (no locking/transactions).
98. No webhook signature verification (payment/provider webhooks spoofable).

## M. Operational

99. No logging/alerting on auth failures or anomalies — a breach goes unnoticed for months.
100. No backups, or untested restore — ransomware / data-loss has no recovery path.

---

### How to use this

Don't audit against all 100. Run the top three categories (A, B, C) against your actual endpoints first — that's where the breach comes from. Then E, D, and L (money paths). The rest is hygiene you fix as you touch the code.

    1. Security headers — Add helmet-equivalent headers (CSP, X-Frame-Options, X-Content-Type-Options) to Hono. ~1 hour.
    2. Session inactivity timeout — Add lastActiveAt to session schema; add middleware or cron to expire idle sessions. ~2 hours.
    3. Backup encryption — Encrypt pg_dump output before writing to disk/S3. ~1 hour.
    4. npm audit in CI — Add bun update && npm audit --production to a CI step. ~30 min.
    5. UI auth gating audit — Verify Next.js middleware protects all app routes. ~1 hour.
