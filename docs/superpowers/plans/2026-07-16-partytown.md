# Partytown implementation plan

Design: `docs/superpowers/specs/2026-07-16-partytown-design.md`

## 1. Establish red tests

1. Add `AnalyticsScript.test.tsx` under the UI Vitest project.
2. Prove no analytics scripts are inserted without accepted consent.
3. Prove accepted consent inserts Plausible and GA scripts as
   `type="text/partytown"`, creates a safe GA initializer, avoids duplicates,
   and dispatches `ptupdate`.
4. Extend `securityHeaders.test.ts` to require an explicit same-origin Partytown
   worker policy.
5. Add a root plain-logic contract test for dependency/scripts, the ignored
   generated directory, and the required copied production files.
6. Run the focused tests and record the expected failures before implementation.

## 2. Add reproducible Partytown assets

1. Install `@qwik.dev/partytown@^0.14.0` in the UI workspace.
2. Add `partytown:copy`, `predev`, and `prebuild` lifecycle scripts.
3. Ignore `packages/ui/public/~partytown/` as generated output.
4. Execute the copy script and verify the official production worker files exist.

## 3. Initialize Partytown in the App Router

1. Import the official React integration in the root server layout.
2. Render `<Partytown forward={["dataLayer.push"]} />` in `<head>` before the
   first-party theme bootstrap.
3. Keep the root layout a Server Component and retain all current metadata,
   fonts, providers, and first-party script behavior.

## 4. Offload consent-gated analytics

1. Refactor the analytics loader to create opted-in Partytown script elements.
2. Validate GA4 measurement IDs before building a URL or inline initializer.
3. Insert GA's external and initializer scripts in document order.
4. Notify Partytown once per insertion batch with `ptupdate`.
5. Keep PostHog's existing dynamic import and cleanup behavior unchanged.
6. Run the focused tests to green, then refactor without broadening scope.

## 5. Update CSP and documentation

1. Add `worker-src 'self' blob:` to the default UI CSP only.
2. Document Partytown, its consent scope, generated assets, and provider
   exclusions in the README/deployment or infrastructure guidance.
3. Record the shipped feature in `docs/project/shipped.md`.

## 6. Verify the actual integration

1. Run focused analytics, CSP, and asset-contract tests.
2. Run the full UI Vitest suite and both relevant TypeScript checks.
3. Run Biome, Knip, generated-output drift, and `git diff --check`.
4. Build the Next.js production app and restore only Next-generated config drift.
5. Start the production UI with test analytics environment values.
6. Verify `/~partytown/partytown.js` and `/~partytown/partytown-sw.js` return 200.
7. Drive a browser with accepted consent and confirm the Partytown bootstrap and
   worker-managed analytics script state without console or CSP errors.
8. Re-scan the final diff against the repository security rules, commit the
   implementation locally, and leave unrelated worktree changes untouched.
