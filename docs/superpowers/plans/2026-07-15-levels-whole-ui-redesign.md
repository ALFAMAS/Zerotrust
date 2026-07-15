# Levels whole-UI redesign implementation plan

Source specification: `docs/superpowers/specs/2026-07-15-levels-whole-ui-redesign-design.md`

## Phase 1 — Foundations and contract tests

1. Add failing tests for the Levels light/dark semantic token contract, light-first theme behavior, 44px controls, semantic status variants, and border-only static cards.
2. Replace the dark-first global palette with the approved light and dark semantic values, status pairs, component boundary tokens, chart tokens, radius derivation, Levels typography scale, motion, and reduced-motion behavior.
3. Replace Bricolage Grotesque and Hanken Grotesk with Inter; retain JetBrains Mono.
4. Make light the application and provider default while preserving stored and system theme choices.
5. Redesign shared buttons, form controls, badges, alerts, cards, tables, tabs, dialogs, dropdowns, tooltips, skeletons, and state components.
6. Run targeted tests, all UI unit tests, formatting, and a production build.

## Phase 2 — Shared composition and shells

1. Add failing component tests for page-header hierarchy, shell active-state cues, drawer focus/labels, and responsive composition.
2. Add shared page-header, action-group, metric, filter-bar, form-section, data-view, and danger-zone patterns.
3. Redesign the public header/footer, auth shell, dashboard shell, and denser admin shell using the same primitives.
4. Verify keyboard navigation, focus restoration, narrow layouts, RTL, theme switching, and reduced motion.

## Phase 3 — Public and authentication routes

1. Inventory root, help, privacy, security, status, terms, invite, and seven auth routes against the shared patterns.
2. Write or extend route tests for semantics and preserved behavior before each migration group.
3. Migrate the public/support pages, then auth and invite flows.
4. Verify SSR/SEO output for public pages and field/error behavior for auth pages.

## Phase 4 — Member dashboard routes

1. Inventory all sixteen dashboard pages by pattern: overview, forms, data tables, detail/settings, security flows, and transactional surfaces.
2. Add failing tests for new shared behavior or semantics before each page group.
3. Migrate overview/account/profile, organizations/settings, security/sessions/JIT, billing/wallet, API keys/webhooks, notifications/support/search.
4. Preserve TanStack Query hooks, mutations, invalidation, redirects, and authorization visibility.

## Phase 5 — Admin routes

1. Inventory all twenty-three admin pages by pattern and density.
2. Add failing tests for operational tables, filters, metrics, details, settings, and destructive workflows before each group.
3. Migrate overview/analytics/revenue, users/tenants/roles/JIT, audit/anomaly/alerts/sessions, compliance/access reviews, content/feedback/search, webhooks/regions/settings.
4. Verify dangerous actions are isolated and resource-specific.

## Phase 6 — Cleanup and completion audit

1. Remove obsolete fonts, compatibility aliases, raw colors, arbitrary spacing, duplicate primitives, dark-first branches, decorative gradients/glows, and unexplained legacy classes.
2. Record effective contrast ratios for both themes and relevant states.
3. Run UI unit tests, TypeScript, production build, and all existing Playwright suites.
4. Render the specification’s public, auth, dashboard, and admin verification matrix in both themes at desktop, 320px, and 200% zoom; check keyboard, reduced motion, long labels, and RTL.
5. Re-inventory every page route and prove it consumes redesigned shells and primitives.
6. Mark the goal complete only when every specification checklist item has direct evidence.

