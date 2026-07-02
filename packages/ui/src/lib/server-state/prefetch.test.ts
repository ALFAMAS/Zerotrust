import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiGetMock = vi.fn();
vi.mock("@/lib/serverApiClient", () => ({
  serverApiGet: (...args: unknown[]) => serverApiGetMock(...args),
}));

import {
  AUTH_ME_PATH,
  adminRecentUsersPrefetchOptions,
  adminStatsPrefetchOptions,
  authMePrefetchOptions,
  buildAdminRecentUsersPath,
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
});
