import { describe, expect, it } from "vitest";
import { queryKeys } from "./queryKeys";

describe("queryKeys", () => {
  it("builds stable auth keys", () => {
    expect(queryKeys.auth.all).toEqual(["auth"]);
    expect(queryKeys.auth.me()).toEqual(["auth", "me"]);
  });

  it("builds admin list and detail keys with filters", () => {
    expect(queryKeys.admin.all).toEqual(["admin"]);
    expect(queryKeys.admin.stats()).toEqual(["admin", "stats"]);
    expect(queryKeys.admin.users.list({ page: 1 })).toEqual([
      "admin",
      "users",
      "list",
      { page: 1 },
    ]);
    expect(queryKeys.admin.users.detail("u1")).toEqual(["admin", "users", "detail", "u1"]);
    expect(queryKeys.admin.sessions.list({ active: true })).toEqual([
      "admin",
      "sessions",
      "list",
      { active: true },
    ]);
    expect(queryKeys.admin.alertChannels.list()).toEqual(["admin", "alertChannels", "list"]);
    expect(queryKeys.admin.accessReviews.detail("ar1")).toEqual([
      "admin",
      "accessReviews",
      "detail",
      "ar1",
    ]);
    expect(queryKeys.admin.revenue.summary()).toEqual(["admin", "revenue", "summary"]);
    expect(queryKeys.admin.feedback.list()).toEqual(["admin", "feedback", "list", {}]);
    expect(queryKeys.admin.roles.list()).toEqual(["admin", "roles", "list"]);
    expect(queryKeys.admin.jitGrants.list({ status: "pending" })).toEqual([
      "admin",
      "jitGrants",
      "list",
      { status: "pending" },
    ]);
    expect(queryKeys.admin.attachments.list()).toEqual(["admin", "attachments", "list", {}]);
    expect(queryKeys.admin.webhookDeliveries.list("wh1", { page: 2 })).toEqual([
      "admin",
      "webhookDeliveries",
      "wh1",
      { page: 2 },
    ]);
    expect(queryKeys.admin.searchIndex.provider()).toEqual(["admin", "searchIndex", "provider"]);
  });

  it("builds account, wallet, and webhook keys", () => {
    expect(queryKeys.account.all).toEqual(["account"]);
    expect(queryKeys.wallet.detail()).toEqual(["wallet", "detail"]);
    expect(queryKeys.wallet.transactions()).toEqual(["wallet", "transactions"]);
    expect(queryKeys.wallet.transactions({ page: 1 })).toEqual([
      "wallet",
      "transactions",
      { page: 1 },
    ]);
    expect(queryKeys.webhooks.list({ active: true })).toEqual([
      "webhooks",
      "list",
      { active: true },
    ]);
    expect(queryKeys.webhooks.detail("wh1")).toEqual(["webhooks", "detail", "wh1"]);
    expect(queryKeys.webhooks.deliveries("wh1", { limit: 10 })).toEqual([
      "webhooks",
      "detail",
      "wh1",
      "deliveries",
      { limit: 10 },
    ]);
  });

  it("builds billing and organization keys", () => {
    expect(queryKeys.billing.subscription()).toEqual(["billing", "subscription"]);
    expect(queryKeys.billing.pricing("USD", "en")).toEqual([
      "billing",
      "pricing",
      { currency: "USD", locale: "en" },
    ]);
    expect(queryKeys.billing.currencies()).toEqual(["billing", "currencies"]);
    expect(queryKeys.billing.usage("org1")).toEqual(["billing", "usage", { orgId: "org1" }]);
    expect(queryKeys.billing.taxExemptions("org1")).toEqual([
      "billing",
      "taxExemptions",
      "org1",
    ]);
    expect(queryKeys.billing.vatValidate("GB123")).toEqual(["billing", "vatValidate", "GB123"]);
    expect(queryKeys.organizations.list()).toEqual(["organizations", "list"]);
    expect(queryKeys.organizations.detail("org1")).toEqual(["organizations", "detail", "org1"]);
    expect(queryKeys.organizations.members("org1", { q: "ada" })).toEqual([
      "organizations",
      "detail",
      "org1",
      "members",
      { q: "ada" },
    ]);
    expect(queryKeys.organizations.invites("org1")).toEqual([
      "organizations",
      "detail",
      "org1",
      "invites",
    ]);
    expect(queryKeys.organizations.securityPolicy("org1")).toEqual([
      "organizations",
      "detail",
      "org1",
      "securityPolicy",
    ]);
    expect(queryKeys.organizations.myInvites()).toEqual(["organizations", "myInvites"]);
  });

  it("builds support, audit, tenant, jit, and compliance keys", () => {
    expect(queryKeys.support.list({ status: "open" })).toEqual([
      "support",
      "list",
      { status: "open" },
    ]);
    expect(queryKeys.support.detail("t1")).toEqual(["support", "detail", "t1"]);
    expect(queryKeys.audit.entries({ actor: "u1" })).toEqual(["audit", "entries", { actor: "u1" }]);
    expect(queryKeys.audit.verify()).toEqual(["audit", "verify"]);
    expect(queryKeys.tenants.list()).toEqual(["tenants", "list", {}]);
    expect(queryKeys.tenants.detail("tenant1")).toEqual(["tenants", "detail", "tenant1"]);
    expect(queryKeys.jit.incoming()).toEqual(["jit", "incoming"]);
    expect(queryKeys.jit.myRequests()).toEqual(["jit", "myRequests"]);
    expect(queryKeys.compliance.soc2Readiness()).toEqual(["compliance", "soc2Readiness"]);
    expect(queryKeys.compliance.soc2Controls()).toEqual(["compliance", "soc2Controls"]);
    expect(queryKeys.compliance.riskAssessment(2026)).toEqual([
      "compliance",
      "riskAssessment",
      2026,
    ]);
  });

  it("builds settings, status, notifications, and search keys", () => {
    expect(queryKeys.anomaly.baselines({ userId: "u1" })).toEqual([
      "anomaly",
      "baselines",
      { userId: "u1" },
    ]);
    expect(queryKeys.settings.general()).toEqual(["settings", "general"]);
    expect(queryKeys.settings.auth()).toEqual(["settings", "auth"]);
    expect(queryKeys.status.current()).toEqual(["status", "current"]);
    expect(queryKeys.notifications.list()).toEqual(["notifications", "list"]);
    expect(queryKeys.notifications.unreadCount()).toEqual(["notifications", "unreadCount"]);
    expect(queryKeys.notifications.preferences()).toEqual(["notifications", "preferences"]);
    expect(queryKeys.nps.shouldPrompt()).toEqual(["nps", "shouldPrompt"]);
    expect(queryKeys.regions.health()).toEqual(["regions", "health"]);
    expect(queryKeys.regions.branding("org1")).toEqual(["regions", "branding", "org1"]);
    expect(queryKeys.search.results({ q: "ada" })).toEqual(["search", "results", { q: "ada" }]);
    expect(queryKeys.sessions.list()).toEqual(["sessions", "list"]);
    expect(queryKeys.apiKeys.list()).toEqual(["apiKeys", "list"]);
  });
});
