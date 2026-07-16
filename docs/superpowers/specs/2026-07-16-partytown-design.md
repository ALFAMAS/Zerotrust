# Partytown analytics offloading design

Date: 2026-07-16

## Objective

Move eligible, consent-gated analytics scripts off the browser main thread with
Partytown while preserving the current privacy contract, keeping critical UI
integrations reliable, and ensuring the worker assets exist in every supported
Next.js development and deployment path.

## Current state

The Next.js 16 application uses the App Router. `AnalyticsScript.tsx` waits for
the existing cookie-consent state and then loads Plausible, GA4, or the bundled
PostHog client. `LiveChatWidget.tsx` can load Crisp, Intercom, or Tawk inside the
authenticated dashboard. Stripe is loaded through its supported client SDK.

Next.js's experimental `next/script` worker strategy is not supported by the App
Router, so this project cannot use `experimental.nextScriptWorkers`. The direct
`@qwik.dev/partytown` React integration is the supported approach: initialize
Partytown in `<head>`, host its worker files on the same origin, and opt individual
scripts in with `type="text/partytown"`.

## Scope

### Offloaded through Partytown

- Plausible's external analytics script.
- GA4's external `gtag.js` script and its initialization script.
- Main-thread calls to `dataLayer.push`, forwarded to the worker by Partytown.

Both remote script endpoints currently return `Access-Control-Allow-Origin: *`,
so no application proxy is required.

### Kept on the main thread

- PostHog: the current implementation is an application-bundled dynamic import,
  not an external script tag. Replacing it with a hosted snippet is a separate
  integration change and is not necessary to implement Partytown safely.
- Crisp, Intercom, and Tawk: these widgets are interactive, DOM-heavy dashboard
  UI and receive the authenticated user's identity. Their reliability is more
  important than background-thread offloading.
- Stripe: payment behavior stays on Stripe's supported SDK path.
- The inline theme bootstrap: it is first-party, render-critical code.

## Architecture

### Root initialization

The root server layout renders the `Partytown` React component in `<head>` before
analytics can be added. Configuration uses the default same-origin library path
`/~partytown/` and forwards `dataLayer.push`.

Partytown's small bootstrap remains on the main thread by design; only explicitly
typed analytics scripts execute in the worker.

### Consent-gated script loader

`AnalyticsScript.tsx` retains the current consent listeners and PostHog lifecycle.
Its external-script helper is narrowed to create Partytown scripts:

1. Set `type="text/partytown"` before inserting the element.
2. Preserve stable IDs so repeated consent events cannot duplicate scripts.
3. Preserve Plausible's domain data attribute.
4. Add GA's external script and a separate inline initialization script in document
   order, using a validated measurement ID rather than interpolating arbitrary text.
5. Dispatch one `ptupdate` event after new scripts are attached so an already-running
   Partytown instance discovers consent-delayed scripts.

Refusing an invalid GA measurement ID is a safe no-op; it prevents an operator-set
public environment value from becoming executable inline JavaScript.

Consent remains fail-closed: no Plausible, GA, or PostHog code is added or initialized
before the user has accepted analytics cookies.

### Static worker assets

Add `@qwik.dev/partytown` to the UI workspace and a `partytown:copy` script that
copies the production library to `packages/ui/public/~partytown`.

- `predev` runs the copy before `next dev`.
- `prebuild` runs the copy before every production build, including CI and the UI
  Docker builder.
- Generated worker files are ignored by Git and remain reproducible from the lockfile.
- The existing UI Dockerfile already copies `packages/ui/public` into the standalone
  runtime image, so the generated worker files are deployed without another image layer.

The existing application service worker keeps its root scope. Partytown registers a
more-specific service worker under `/~partytown/`; the scopes can coexist.

## Security and CSP

The existing default UI policy permits same-origin scripts and the configured analytics
origins. Add an explicit `worker-src 'self' blob:` directive so browser worker behavior
does not depend on CSP fallback rules. The existing `script-src 'unsafe-inline'` remains
unchanged because Next.js and the current theme/Partytown bootstraps already require it;
nonce hardening is outside this focused change.

No proxy endpoint, user-influenced server fetch, redirect, secret, or new logging path is
introduced. Only public analytics identifiers are exposed to the client. A custom `UI_CSP`
continues to override the default policy and remains the operator's responsibility.

## Failure behavior

- Without consent, analytics remain unloaded.
- Without analytics environment values, Partytown initializes but has no third-party
  scripts to execute.
- An invalid GA identifier is ignored rather than embedded in an inline script.
- If Partytown cannot use workers or service workers, its documented fallback executes
  opted-in scripts conventionally; analytics behavior remains available.
- If static assets are missing, build verification fails before deployment.

## Testing and verification

Implementation follows red-green-refactor:

1. A component test first proves accepted consent creates `text/partytown` Plausible and
   GA scripts, creates the GA initializer without unsafe interpolation, and dispatches
   `ptupdate`.
2. A component test proves denied or absent consent creates no analytics scripts.
3. A security-header test first requires `worker-src 'self' blob:` while preserving the
   analytics and API origins.
4. An asset-contract test first requires the copy lifecycle scripts, ignored generated
   directory, and copied production library files.
5. Focused tests, UI type-check, Biome, Knip, and a production Next.js build must pass.
6. Browser verification uses an accepted-consent fixture with a test GA identifier and
   confirms the root HTML contains the Partytown bootstrap, the worker assets return 200,
   and opted-in scripts are handled by Partytown rather than executed as ordinary
   main-thread script elements.

## Acceptance criteria

- The App Router initializes Partytown from the official React integration.
- Plausible and GA4 are consent-gated and marked for worker execution.
- GA main-thread event calls are forwarded through `dataLayer.push`.
- Consent-delayed scripts notify Partytown through `ptupdate`.
- PostHog, chat, Stripe, and first-party critical scripts retain their current execution
  paths.
- `public/~partytown` is generated automatically for dev, build, CI, and Docker.
- CSP explicitly allows the required worker sources without broadening remote script hosts.
- Automated tests and production/browser verification prove the integration works.

## Non-goals

- Migrating PostHog from its bundled SDK to a hosted snippet.
- Offloading interactive live-chat or payment integrations.
- Adding analytics providers, changing consent categories, or changing event semantics.
- Building a third-party script proxy.
- Replacing the current CSP inline-script strategy with request nonces.
