export const PLANS = ["free", "pro", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanConfig {
  name: string;
  features: Record<string, boolean | number>;
}

export const PLAN_CONFIGS: Record<Plan, PlanConfig> = {
  free: {
    name: "Free",
    features: {
      apiKeys: 2,
      orgMembers: 5,
      customRoles: false,
      auditLog: false,
      ssoSaml: false,
      advancedMfa: false,
      prioritySupport: false,
    },
  },
  pro: {
    name: "Pro",
    features: {
      apiKeys: 20,
      orgMembers: 50,
      customRoles: true,
      auditLog: true,
      ssoSaml: false,
      advancedMfa: true,
      prioritySupport: false,
    },
  },
  enterprise: {
    name: "Enterprise",
    features: {
      apiKeys: -1, // unlimited
      orgMembers: -1,
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
