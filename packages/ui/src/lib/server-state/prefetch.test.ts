import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiGetMock = vi.fn();
vi.mock("@/lib/serverApiClient", () => ({
  serverApiGet: (...args: unknown[]) => serverApiGetMock(...args),
}));

import {
  AUTH_ME_PATH,
  adminRecentUsersPrefetchOptions,
  adminSessionsListPrefetchOptions,
  adminStatsPrefetchOptions,
  adminUsersListPrefetchOptions,
  authMePrefetchOptions,
  billingSubscriptionPrefetchOptions,
  buildAdminRecentUsersPath,
  buildAdminSessionsListPath,
  buildAdminUsersListPath,
  buildWalletTransactionPath,
  walletPrefetchOptions,
  walletTransactionsPrefetchOptions,
} from "./prefetch";

describe("prefetch options factories", () => {
  beforeEach(() => {
    serverApiGetMock.mockReset();
  });

  it("exposes stable auth and admin path constants", () => {
    expect(AUTH_ME_PATH).toBe("/auth/me");
    expect(buildAdminRecentUsersPath(5)).toBe("/admin/users?limit=5");
  });

  it("authMePrefetchOptions calls serverApiGet with the auth path", async () => {
    serverApiGetMock.mockResolvedValueOnce({ id: "u1" });
    const options = authMePrefetchOptions();
    expect(options.queryKey).toEqual(["auth", "me"]);
    await options.queryFn?.({} as never);
    expect(serverApiGetMock).toHaveBeenCalledWith("/auth/me");
  });

  it("adminStatsPrefetchOptions calls serverApiGet with admin stats", async () => {
    serverApiGetMock.mockResolvedValueOnce({ users: 1 });
    const options = adminStatsPrefetchOptions();
    expect(options.queryKey).toEqual(["admin", "stats"]);
    await options.queryFn?.({} as never);
    expect(serverApiGetMock).toHaveBeenCalledWith("/admin/stats");
  });

  it("adminRecentUsersPrefetchOptions normalizes paginated responses", async () => {
    serverApiGetMock.mockResolvedValueOnce({
      data: [{ id: "u1", email: "a@example.com" }],
      pagination: { total: 1 },
    });
    const options = adminRecentUsersPrefetchOptions(5);
    const users = await options.queryFn?.({} as never);
    expect(serverApiGetMock).toHaveBeenCalledWith("/admin/users?limit=5");
    expect(users).toEqual([{ id: "u1", email: "a@example.com" }]);
  });

  it("wallet prefetch options call the wallet API paths", async () => {
    serverApiGetMock.mockResolvedValueOnce({ balance: 1000, currency: "USD" });
    const walletOptions = walletPrefetchOptions();
    await walletOptions.queryFn?.({} as never);
    expect(serverApiGetMock).toHaveBeenCalledWith("/wallet");

    serverApiGetMock.mockResolvedValueOnce({ data: [], pagination: { total: 0 } });
    const txOptions = walletTransactionsPrefetchOptions();
    expect(buildWalletTransactionPath()).toBe("/wallet/transactions?limit=30");
    await txOptions.queryFn?.({} as never);
    expect(serverApiGetMock).toHaveBeenCalledWith("/wallet/transactions?limit=30");
  });

  it("billingSubscriptionPrefetchOptions calls subscription endpoint", async () => {
    serverApiGetMock.mockResolvedValueOnce({ plan: "free", status: "active" });
    const options = billingSubscriptionPrefetchOptions();
    await options.queryFn?.({} as never);
    expect(serverApiGetMock).toHaveBeenCalledWith("/billing/subscription");
  });

  it("admin list prefetch options use paginated paths", async () => {
    expect(buildAdminUsersListPath({ page: 1, status: "all" })).toBe(
      "/admin/users?page=1&limit=20"
    );
    expect(buildAdminSessionsListPath({ page: 1, limit: 20 })).toBe(
      "/admin/sessions?page=1&limit=20"
    );

    serverApiGetMock.mockResolvedValueOnce({ data: [], pagination: { total: 0 } });
    await adminUsersListPrefetchOptions({ page: 1, status: "all" }).queryFn?.({} as never);
    expect(serverApiGetMock).toHaveBeenCalledWith("/admin/users?page=1&limit=20");

    serverApiGetMock.mockResolvedValueOnce({ data: [], pagination: { total: 0 } });
    await adminSessionsListPrefetchOptions({ page: 1, limit: 20 }).queryFn?.({} as never);
    expect(serverApiGetMock).toHaveBeenCalledWith("/admin/sessions?page=1&limit=20");
  });
});
