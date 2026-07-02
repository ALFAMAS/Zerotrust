export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: () => [...queryKeys.auth.all, "me"] as const,
    oauthProviders: () => [...queryKeys.auth.all, "oauthProviders"] as const,
  },
  admin: {
    all: ["admin"] as const,
    users: {
      all: () => [...queryKeys.admin.all, "users"] as const,
      list: (filters: Record<string, string | number | undefined> = {}) =>
        [...queryKeys.admin.users.all(), "list", filters] as const,
      detail: (id: string) => [...queryKeys.admin.users.all(), "detail", id] as const,
    },
    sessions: {
      all: () => [...queryKeys.admin.all, "sessions"] as const,
      list: (filters: Record<string, string | number | undefined> = {}) =>
        [...queryKeys.admin.sessions.all(), "list", filters] as const,
    },
  },
  wallet: {
    all: ["wallet"] as const,
    detail: () => [...queryKeys.wallet.all, "detail"] as const,
    transactions: (params?: Record<string, string | number | undefined>) =>
      params
        ? ([...queryKeys.wallet.all, "transactions", params] as const)
        : ([...queryKeys.wallet.all, "transactions"] as const),
  },
  webhooks: {
    all: ["webhooks"] as const,
    list: (filters: Record<string, string | number | undefined> = {}) =>
      [...queryKeys.webhooks.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.webhooks.all, "detail", id] as const,
    deliveries: (id: string, params: Record<string, string | number | undefined> = {}) =>
      [...queryKeys.webhooks.detail(id), "deliveries", params] as const,
  },
  billing: {
    all: ["billing"] as const,
    subscription: () => [...queryKeys.billing.all, "subscription"] as const,
    pricing: (currency: string, locale: string) =>
      [...queryKeys.billing.all, "pricing", { currency, locale }] as const,
    currencies: () => [...queryKeys.billing.all, "currencies"] as const,
  },
  organizations: {
    all: ["organizations"] as const,
    list: () => [...queryKeys.organizations.all, "list"] as const,
    detail: (orgId: string) => [...queryKeys.organizations.all, "detail", orgId] as const,
    members: (orgId: string, filters: Record<string, string | number | undefined> = {}) =>
      [...queryKeys.organizations.detail(orgId), "members", filters] as const,
  },
  support: {
    all: ["support"] as const,
    list: (filters: Record<string, string | number | undefined> = {}) =>
      [...queryKeys.support.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.support.all, "detail", id] as const,
  },
  audit: {
    all: ["audit"] as const,
    entries: (filters: Record<string, string | number | undefined> = {}) =>
      [...queryKeys.audit.all, "entries", filters] as const,
    verify: () => [...queryKeys.audit.all, "verify"] as const,
  },
  tenants: {
    all: ["tenants"] as const,
    list: (filters: Record<string, string | number | undefined> = {}) =>
      [...queryKeys.tenants.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.tenants.all, "detail", id] as const,
  },
  jit: {
    all: ["jit"] as const,
    incoming: () => [...queryKeys.jit.all, "incoming"] as const,
  },
  compliance: {
    all: ["compliance"] as const,
    soc2Readiness: () => [...queryKeys.compliance.all, "soc2Readiness"] as const,
    soc2Controls: () => [...queryKeys.compliance.all, "soc2Controls"] as const,
    riskAssessment: (year: number) =>
      [...queryKeys.compliance.all, "riskAssessment", year] as const,
  },
  anomaly: {
    all: ["anomaly"] as const,
    baselines: (filters: Record<string, string | number | undefined> = {}) =>
      [...queryKeys.anomaly.all, "baselines", filters] as const,
  },
  settings: {
    all: ["settings"] as const,
    general: () => [...queryKeys.settings.all, "general"] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: () => [...queryKeys.notifications.all, "list"] as const,
    unreadCount: () => [...queryKeys.notifications.all, "unreadCount"] as const,
  },
};
