# Phase 11 — shadcn/ui Migration Slice

Date: 2026-06-25  
Goal: reduce the raw-control baseline with concrete component migrations, not only audits.

## Implemented in this phase

| Workstream | Deliverable | Result |
|---|---|---|
| Shared primitive | Added shadcn-compatible `Textarea` under `components/ui`. | Feedback and survey forms can use the shared focus/theme treatment. |
| Feedback widget migration | Replaced raw feedback widget controls with shadcn `Card`, `Button`, and `Textarea`. | Removes bespoke button/textarea styling from the floating feedback prompt. |
| NPS prompt migration | Replaced raw NPS prompt controls with shadcn `Card`, `Button`, and `Textarea`. | Reduces raw controls in shared dashboard UX. |
| Baseline reduction | Regenerated `docs/shadcn-adoption-report.md`. | Raw controls reduced from 162 across 40 files to 153 across 38 files. |

## Next migration slices

1. `packages/ui/src/app/dashboard/organizations/[orgId]/settings/page.tsx`
2. `packages/ui/src/app/admin/workload/page.tsx`
3. `packages/ui/src/app/dashboard/organizations/[orgId]/settings/SsoSettingsForm.tsx`
4. `packages/ui/src/app/dashboard/billing/page.tsx`
