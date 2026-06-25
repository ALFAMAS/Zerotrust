# Phase 12 — shadcn/ui Migration Slice

Date: 2026-06-25  
Goal: continue reducing raw-control drift in shared UI components.

## Implemented in this phase

| Workstream | Deliverable | Result |
|---|---|---|
| Locale switcher migration | Replaced raw language toggle/list buttons with shadcn `Button`. | Removes bespoke controls from global locale switching. |
| Product tour migration | Replaced overlay skip and footer skip controls with shadcn `Button`. | Keeps onboarding tour controls on shared variants. |
| Setup checklist migration | Replaced dismiss action with shadcn `Button`. | Reduces bespoke dashboard onboarding controls. |
| Baseline reduction | Regenerated `docs/shadcn-adoption-report.md`. | Raw controls reduced from 153 across 38 files to 148 across 35 files. |
