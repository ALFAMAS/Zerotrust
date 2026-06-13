export const PLANS = ["free", "pro", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanConfig {
  name: string;
  /** Monthly price in USD — used by the admin revenue dashboard (MRR/ARR). */
  priceMonthly: number;
  features: Record<string, boolean | number>;
}

export const PLAN_CONFIGS: Record<Plan, PlanConfig> = {
  free: {
    name: "Free",
    priceMonthly: 0,
    features: {
      apiKeys: 2,
      orgMembers: 5,
      apiCallsPerMonth: 10_000,
      storageBytes: 100 * 1024 * 1024, // 100 MB
      customRoles: false,
      auditLog: false,
      ssoSaml: false,
      advancedMfa: false,
      prioritySupport: false,
    },
  },
  pro: {
    name: "Pro",
    priceMonthly: parseInt(process.env.PLAN_PRO_PRICE_MONTHLY ?? "29"),
    features: {
      apiKeys: 20,
      orgMembers: 50,
      apiCallsPerMonth: 1_000_000,
      storageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
      customRoles: true,
      auditLog: true,
      ssoSaml: false,
      advancedMfa: true,
      prioritySupport: false,
    },
  },
  enterprise: {
    name: "Enterprise",
    priceMonthly: parseInt(process.env.PLAN_ENTERPRISE_PRICE_MONTHLY ?? "99"),
    features: {
      apiKeys: -1, // unlimited
      orgMembers: -1,
      apiCallsPerMonth: -1,
      storageBytes: -1,
      customRoles: true,
      auditLog: true,
      ssoSaml: true,
      advancedMfa: true,
      prioritySupport: true,
    },
  },
};

export function planAllows(plan: Plan, feature: string): boolean {
  const config = PLAN_CONFIGS[plan];
  if (!config) return false;
  const val = config.features[feature];
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  return false;
}

export function planLimit(plan: Plan, feature: string): number {
  const config = PLAN_CONFIGS[plan];
  if (!config) return 0;
  const val = config.features[feature];
  if (typeof val === "number") return val;
  return val ? Infinity : 0;
}
