# Quality Rules — Performance · Accessibility · Best Practices · SEO

> **Agent instructions:** Web and API rules are merged into [`AGENTS.md`](../AGENTS.md) § Quality rules (with a pointer in [`CLAUDE.md`](../CLAUDE.md)). This file remains the scoped reference — especially Mobile/Expo blocks not yet in the repo.

Agent directives. Scoped by surface: **Web** = Next.js · **Mobile** = Expo/React Native · **API** = Hono.
Apply only the block matching the file you're editing. Security rules live in `SECURITY.md` / `CLAUDE.md` — don't duplicate them here.

`N/A` blocks are intentional: do **not** invent web patterns (meta tags, ARIA) inside native code.

---

## Performance

### Web (Next.js)

- Server Components by default. `'use client'` only at interactive leaves — never on a route/layout root.
- Images: `next/image` only. Never raw `<img>`. Serves AVIF/WebP, lazy, correct `sizes`.
- Fonts: `next/font` (self-hosted, no layout shift). No `<link>` to Google Fonts.
- Heavy client components: `next/dynamic` with `ssr: false` where they can't render server-side.
- No barrel-file (`index.ts` re-export) imports of large libs — they defeat tree-shaking and route splitting.
- Slow data: stream via `<Suspense>`. Don't block the whole route.
- Don't globally opt out of caching. Set `revalidate` / `cache` per fetch deliberately.
- Never ship large datasets to the client. Paginate server-side.
- Targets: LCP < 2.5s, INP < 200ms, CLS < 0.1. (INP replaced FID — don't reference FID.)
- `@next/bundle-analyzer` gate in CI; fail on unexplained bundle growth.

### Mobile (Expo)

- Long lists: `FlashList` (preferred) or `FlatList`. Never `.map()` over large arrays inside `ScrollView`.
- Images: `expo-image`, not RN `Image`. It caches; RN `Image` doesn't.
- Animations: Reanimated (UI thread). Avoid JS-driven `Animated` on hot paths.
- Memoize list items (`React.memo`) and their callbacks (`useCallback`). No inline objects/arrows as props in list rows.
- Do not over-memoize elsewhere — `useMemo` has a cost; use it on measured hot paths only.
- Hermes stays on (default). Don't disable it.
- Keep work off the JS thread. Offload heavy compute; watch for dropped frames.
- Target 60fps. No CWV concept here — profile frame time, not LCP.

### API (Hono)

- DB: no N+1. Index every column used in `where`/`join`. `select` only needed columns. Paginate.
- `Cache-Control` on cacheable GETs. Response compression on.
- Connection pooling configured; verify it survives pgbouncer transaction mode.
- Stream large responses. Timeout + abort every outbound fetch.

---

## Accessibility

### Web (Next.js)

- Semantic HTML. `<button>` for actions, never `<div onClick>`. Landmarks: `nav`/`main`/`header`.
- Every input has an associated `<label htmlFor>`.
- `alt` on every image. Empty `alt=""` for decorative.
- Text contrast ≥ 4.5:1 (≥ 3:1 large text).
- Keyboard: visible focus, logical tab order, no focus traps. Modals trap-and-restore focus.
- ARIA only when native semantics are insufficient. Native first.
- Route change / modal open: move focus deliberately.
- Form errors: `aria-describedby` + `aria-live` so they're announced.
- `<html lang>` set. Respect `prefers-reduced-motion`.

### Mobile (Expo) — different API, not ARIA

- `accessible` + `accessibilityLabel` on every interactive element.
- `accessibilityRole` (`button`, `header`, `link`, `image`…).
- `accessibilityState` for `disabled`/`selected`/`checked`.
- `accessibilityHint` where the action isn't obvious from the label.
- Touch targets ≥ 44×44pt.
- Support font scaling — don't hardcode `allowFontScaling={false}` globally. Contrast ≥ 4.5:1.
- Verify with VoiceOver (iOS) and TalkBack (Android). Do not use ARIA attributes.

### API

- N/A.

---

## Best Practices

### Web (Next.js)

- Zero console errors/warnings in production build.
- HTTPS only, no mixed content. CSP per `SECURITY.md`.
- `target="_blank"` carries `rel="noopener noreferrer"`.
- Valid HTML, no duplicate `id`s, correct image aspect ratios (prevents CLS).
- No deprecated APIs. Error boundaries around dynamic subtrees.
- Production source maps handled deliberately (hidden or intentionally shipped).

### Mobile (Expo)

- No secrets in the bundle (`SECURITY.md`). Assume full source disclosure.
- Handle offline and network failure states explicitly — no silent hangs.
- Permissions requested at point of use, with rationale. Not all upfront.
- Crash + error reporting wired (e.g. Sentry).
- EAS Update code signing on (`SECURITY.md`). Respect safe-area insets (notches).

### API (Hono)

- Correct status codes and method semantics (GET/PUT idempotent, no side effects on GET).
- One consistent error envelope across all routes.
- Versioned API surface. All inputs validated (`SECURITY.md` / zod).
- Structured logs with request IDs.

---

## SEO

### Web (Next.js) — the only surface where this applies

- `generateMetadata` per route: unique `title` + `description`. Static `metadata` for static routes.
- Open Graph + Twitter card tags on public/shareable pages.
- One `<h1>` per page; heading order logical.
- `app/sitemap.ts` + `app/robots.ts`. Canonical URLs set.
- JSON-LD structured data where the content type warrants it (Article, Product, FAQ…).
- Descriptive link text. Never "click here".
- Content that must be indexed renders SSR/SSG — never client-only.
- **Scope discipline:** authenticated app routes are behind login and never indexed. Spend SEO effort on marketing/landing/public pages only. Do not add SEO scaffolding to dashboard routes.

### Mobile (Expo)

- N/A for search engines. If discoverability matters, that's **ASO** (store listing, keywords, screenshots, ratings) — out of scope for code and not solved with meta tags. Do not add SEO markup to native screens.

### API

- N/A.
