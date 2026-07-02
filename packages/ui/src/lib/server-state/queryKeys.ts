export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: () => [...queryKeys.auth.all, "me"] as const,
    oauthProviders: () => [...queryKeys.auth.all, "oauthProviders"] as const,
  },
  admin: {
    all: ["admin"] as const,
    stats: () => [...queryKeys.admin.all, "stats"] as const,
    users: {
      all: () => [...queryKeys.admin.all, "users"] as const,
      list: (filters: object = {}) => [...queryKeys.admin.users.all(), "list", filters] as const,
      detail: (id: string) => [...queryKeys.admin.users.all(), "detail", id] as const,
    },
    sessions: {
      all: () => [...queryKeys.admin.all, "sessions"] as const,
      list: (filters: object = {}) => [...queryKeys.admin.sessions.all(), "list", filters] as const,
    },
    alertChannels: {
      all: () => [...queryKeys.admin.all, "alertChannels"] as const,
      list: () => [...queryKeys.admin.alertChannels.all(), "list"] as const,
    },
    accessReviews: {
      all: () => [...queryKeys.admin.all, "accessReviews"] as const,
      list: () => [...queryKeys.admin.accessReviews.all(), "list"] as const,
      detail: (id: string) => [...queryKeys.admin.accessReviews.all(), "detail", id] as const,
    },
    revenue: {
      all: () => [...queryKeys.admin.all, "revenue"] as const,
      summary: () => [...queryKeys.admin.revenue.all(), "summary"] as const,
    },
    feedback: {
      all: () => [...queryKeys.admin.all, "feedback"] as const,
      list: (filters: object = {}) => [...queryKeys.admin.feedback.all(), "list", filters] as const,
    },
    roles: {
      all: () => [...queryKeys.admin.all, "roles"] as const,
      list: () => [...queryKeys.admin.roles.all(), "list"] as const,
    },
    jitGrants: {
      all: () => [...queryKeys.admin.all, "jitGrants"] as const,
      list: (filters: object = {}) =>
        [...queryKeys.admin.jitGrants.all(), "list", filters] as const,
    },
    attachments: {
      all: () => [...queryKeys.admin.all, "attachments"] as const,
      list: (filters: object = {}) =>
        [...queryKeys.admin.attachments.all(), "list", filters] as const,
    },
    webhookDeliveries: {
      all: () => [...queryKeys.admin.all, "webhookDeliveries"] as const,
      list: (webhookId: string, filters: object = {}) =>
        [...queryKeys.admin.webhookDeliveries.all(), webhookId, filters] as const,
    },
    searchIndex: {
      all: () => [...queryKeys.admin.all, "searchIndex"] as const,
      provider: () => [...queryKeys.admin.searchIndex.all(), "provider"] as const,
    },
  },
  account: {
    all: ["account"] as const,
  },
  wallet: {
    all: ["wallet"] as const,
    detail: () => [...queryKeys.wallet.all, "detail"] as const,
    transactions: (params?: object) =>
      params
        ? ([...queryKeys.wallet.all, "transactions", params] as const)
        : ([...queryKeys.wallet.all, "transactions"] as const),
  },
  webhooks: {
    all: ["webhooks"] as const,
    list: (filters: object = {}) => [...queryKeys.webhooks.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.webhooks.all, "detail", id] as const,
    deliveries: (id: string, params: object = {}) =>
      [...queryKeys.webhooks.detail(id), "deliveries", params] as const,
  },
  billing: {
    all: ["billing"] as const,
    subscription: () => [...queryKeys.billing.all, "subscription"] as const,
    pricing: (currency: string, locale: string) =>
      [...queryKeys.billing.all, "pricing", { currency, locale }] as const,
    currencies: () => [...queryKeys.billing.all, "currencies"] as const,
    usage: (orgId?: string) => [...queryKeys.billing.all, "usage", { orgId }] as const,
    taxExemptions: (orgId: string) => [...queryKeys.billing.all, "taxExemptions", orgId] as const,
    vatValidate: (vat: string) => [...queryKeys.billing.all, "vatValidate", vat] as const,
  },
  organizations: {
    all: ["organizations"] as const,
    list: () => [...queryKeys.organizations.all, "list"] as const,
    detail: (orgId: string) => [...queryKeys.organizations.all, "detail", orgId] as const,
    members: (orgId: string, filters: object = {}) =>
      [...queryKeys.organizations.detail(orgId), "members", filters] as const,
    invites: (orgId: string) => [...queryKeys.organizations.detail(orgId), "invites"] as const,
    securityPolicy: (orgId: string) =>
      [...queryKeys.organizations.detail(orgId), "securityPolicy"] as const,
  },
  support: {
    all: ["support"] as const,
    list: (filters: object = {}) => [...queryKeys.support.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.support.all, "detail", id] as const,
  },
  audit: {
    all: ["audit"] as const,
    entries: (filters: object = {}) => [...queryKeys.audit.all, "entries", filters] as const,
    verify: () => [...queryKeys.audit.all, "verify"] as const,
  },
  tenants: {
    all: ["tenants"] as const,
    list: (filters: object = {}) => [...queryKeys.tenants.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.tenants.all, "detail", id] as const,
  },
  jit: {
    all: ["jit"] as const,
    incoming: () => [...queryKeys.jit.all, "incoming"] as const,
    myRequests: () => [...queryKeys.jit.all, "myRequests"] as const,
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
    baselines: (filters: object = {}) => [...queryKeys.anomaly.all, "baselines", filters] as const,
  },
  settings: {
    all: ["settings"] as const,
    general: () => [...queryKeys.settings.all, "general"] as const,
    auth: () => [...queryKeys.settings.all, "auth"] as const,
  },
  status: {
    all: ["status"] as const,
    current: () => [...queryKeys.status.all, "current"] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: () => [...queryKeys.notifications.all, "list"] as const,
    unreadCount: () => [...queryKeys.notifications.all, "unreadCount"] as const,
    preferences: () => [...queryKeys.notifications.all, "preferences"] as const,
  },
  nps: {
    all: ["nps"] as const,
    shouldPrompt: () => [...queryKeys.nps.all, "shouldPrompt"] as const,
  },
  regions: {
    all: ["regions"] as const,
    health: () => [...queryKeys.regions.all, "health"] as const,
    branding: (orgId: string) => [...queryKeys.regions.all, "branding", orgId] as const,
  },
  search: {
    all: ["search"] as const,
    results: (params: object = {}) => [...queryKeys.search.all, "results", params] as const,
  },
  sessions: {
    all: ["sessions"] as const,
    list: () => [...queryKeys.sessions.all, "list"] as const,
  },
  apiKeys: {
    all: ["apiKeys"] as const,
    list: () => [...queryKeys.apiKeys.all, "list"] as const,
  },
};
