# Levels whole-UI redesign verification

Date: 2026-07-15

Source specification: [`../specs/2026-07-15-levels-whole-ui-redesign-design.md`](../specs/2026-07-15-levels-whole-ui-redesign-design.md)

## Implemented scope

- The route inventory still contains 53 `page.tsx` routes. The production build generated all 53 successfully.
- Public, authentication, dashboard, and admin routes now inherit the shared light-first Levels foundations and their family shell.
- The public header/footer, authentication split shell, grouped application navigation, top bar, page header, controls, cards, tables, states, dialogs, badges, metrics, filters, form sections, data regions, action groups, and destructive zones use shared semantic primitives.
- Inter and JetBrains Mono load through `next/font`. Light is the default theme and the direct light/dark control retains dark-mode support.
- The migration audit rejects raw Tailwind palette classes, legacy grid/blur decoration, oversized shadows, off-scale text and spacing, oversized radii, raw images, duplicate visual primitives, inline application headings outside `PageHeader`, inline SVG hex colors, and pulse animation without a reduced-motion override.
- The application shell switches to its drawer layout below an explicit 1024px threshold. This prevents enlarged text from activating a crowded desktop sidebar/topbar layout.
- A rendered 200% text check exposed a remaining dashboard-security overflow. Compact top-bar utilities now defer until sufficient width is available, and connected-account status/action groups wrap without losing controls or meaning.

## Route-family evidence

| Family | Count | Shared composition |
| --- | ---: | --- |
| Public/support | 7 | `SiteHeader`, `SiteFooter`, semantic public sections |
| Authentication | 7 | `(auth)/layout.tsx`, shared form controls and state patterns |
| Dashboard | 16 | `dashboard/layout.tsx`, `AppShell`, grouped member navigation |
| Admin | 23 | `admin/layout.tsx`, `AppShell`, grouped operational navigation |
| Total | 53 | Shared globals, theme provider, tokens, and primitives |

## Measured contrast

Ratios use the WCAG relative-luminance formula against the effective token pair.

| Token pair | Light | Dark |
| --- | ---: | ---: |
| Foreground / background | 16.96:1 | 19.06:1 |
| Muted foreground / background | 7.39:1 | 7.76:1 |
| Primary foreground / primary | 14.89:1 | 16.97:1 |
| Secondary action foreground / action | 5.70:1 | 6.51:1 |
| Success subtle foreground / background | 6.49:1 | 6.49:1 |
| Warning subtle foreground / background | 6.37:1 | 7.28:1 |
| Danger subtle foreground / background | 6.80:1 | 5.28:1 |
| Control border / surface | 4.83:1 | 3.67:1 |
| Focus ring / background | 5.45:1 | 10.78:1 |
| Focus ring / surface | 5.70:1 | 9.60:1 |

All measured text pairs exceed WCAG 2.2 AA's 4.5:1 normal-text threshold. Control boundaries and focus indicators exceed the 3:1 non-text contrast threshold in both themes. Decorative panel borders are not relied on as the sole cue for controls or state.

## Automated verification

- `bun run lint`: passed, 571 files checked.
- `bun run test` from `packages/ui`: passed, 68 files and 283 tests.
- `bun run type-check`: passed for the repository.
- `bun run build` from `packages/ui`: passed TypeScript and generated all 53 pages. The final verification used the opt-in `ZEROTRUST_NEXT_DIST_DIR=.next-build` output so it could run without disrupting an active `.next` development server; the generated directory was removed afterward.
- `git diff --check`: passed.
- Existing Playwright public, auth, dashboard, admin, access-review, billing, interactive, invite, notification, security, wallet, and webhook suites: 92/92 passed against clean, independently health-checked API and UI services (22 + 70 grouped runs).
- Levels rendered matrix: 31/31 passed (29 representative/layout cases plus 2 loading/error state cases). It covers landing, help, status, legal, invite, login, register, password recovery, magic-link verification, dashboard overview, organization detail/settings, security, billing, sessions, profile, admin overview/analytics, users/detail, audit, access reviews/detail, settings, and an operational table.
- The 31-case matrix was rerun after the dashboard-security overflow fix and passed in full. A follow-up attempt to rerun all 119 Playwright tests against an already-running developer stack was not valid evidence for real-API flows: that API had rate limiting enabled (HTTP 429) and the sandbox blocked direct database fixture access. The pre-existing clean-stack 92/92 result above remains recorded separately; no current failure was attributed to redesigned UI behavior.
- Each representative matrix case checks both themes, desktop rendering, 320px reflow, simulated 200% text zoom, keyboard focus, reduced motion, a long localized heading, and RTL. Empty datasets are exercised in users, audit, access-review, analytics, and invite/error fixtures; explicit loading and error cases retain a single page heading and announce the error.
- The live-stack race was removed by probing API and UI servers independently. Existing-server reuse is now explicit through `E2E_REUSE_SERVER=true`, preventing a normal rate-limited developer server from being mistaken for the controlled E2E backend. Registration helpers also report the safe status/message for registration and post-registration login separately without exposing credentials or tokens.
- The rendered checks found and fixed the 200% text overflow in the authenticated shell. The billing browser warning was traced to a stale currency fixture and removed by matching the real `{ code, symbol }` response shape.
