# React render baseline

Date: 2026-07-16

Runtime: Next.js 16.2.10 development server, React 19.2.7, React Scan 0.5.7

Viewport: 1440 × 1000, headless Chromium

## Method

The browser used an authenticated admin fixture and a deterministic local API
fixture. React Scan was loaded from the self-hosted `beforeInteractive` asset.
Its `onRender` callback recorded component render counts and reported render
time during each isolated interaction. The production API and database were not
used, so these figures are repeatable render baselines rather than network or
end-to-end latency measurements.

## Baseline

| Interaction | Highest render counts | Reported time leaders |
| --- | --- | --- |
| Admin users: fill the server filter, then sort the User column twice | `TableCell` 290; cell renderers 288; `Button` 156; `Badge` 96; `TableRow` 58 | cell renderers 21.3 ms; `TableCell` 7.3 ms; anonymous wrappers 6.9 ms |
| Command palette: open, search for profile, and navigate | anonymous cmdk/Radix wrappers 154; `Primitive.div` 60; `Presence` 31; `LinkComponent` 21 | anonymous wrappers 17.6 ms; `LinkComponent` 3.0 ms; `SidebarNavLink` 2.3 ms |
| Admin audit chart: hover/scrub at three x positions | `XAxisLabel` 10; `Line` 8; chart/core children 2 each | `TimeSeriesChartCore` 1.4 ms; `Grid` 0.8 ms; `Area` 0.5 ms |
| Dashboard shell: collapse sidebar and open notifications | `LinkComponent` 33; `Presence` 30; tooltip primitives 28–29 each | `LinkComponent` 2.8 ms; `Tooltip` 2.8 ms; `TooltipTrigger` 2.2 ms |

## Interpretation

- The admin users table is the primary compiler comparison surface because a
  small filter/sort sequence fans out through every visible row and action.
- Command-palette navigation includes the destination shell mount, so its
  counts are an interaction baseline, not a search-input-only microbenchmark.
- Chart pointer work is already localized: the chart subtree updates twice and
  the repeated counts are predominantly labels and SVG lines.
- Sidebar collapse necessarily changes every navigation tooltip/link. The
  notification open is included in the same shell interaction to match the
  approved rollout plan.

Re-run the same four interactions after enabling React Compiler. A regression is
either a browser/hydration error or a material count/time increase on the same
deterministic fixture; timing differences below a few milliseconds are treated
as development-build noise unless repeatable.
