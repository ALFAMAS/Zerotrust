// Single source of truth for plan prices displayed in the UI (BILL-PRICE-1).
//
// Mirrors the server-side defaults in `src/shared/plans.ts` (PLAN_CONFIGS),
// which drive the admin revenue dashboard. If you override the API's
// PLAN_PRO_PRICE_MONTHLY / PLAN_ENTERPRISE_PRICE_MONTHLY, set the matching
// NEXT_PUBLIC_* variables below so marketing pages and the billing dashboard
// stay in sync.
export const planPrices = {
  free: 0,
  pro: Number.parseInt(process.env.NEXT_PUBLIC_PLAN_PRO_PRICE_MONTHLY ?? "29", 10),
  enterprise: Number.parseInt(process.env.NEXT_PUBLIC_PLAN_ENTERPRISE_PRICE_MONTHLY ?? "99", 10),
} as const;

export type PlanId = keyof typeof planPrices;

export function formatPlanPrice(plan: PlanId): string {
  return `$${planPrices[plan]}`;
}
