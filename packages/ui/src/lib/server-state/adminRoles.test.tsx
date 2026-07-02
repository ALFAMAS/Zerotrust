import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet, mockApiPost } from "@/test/apiClientMock";
import { adminRolesKeys, useAdminRolesQuery, useCreateAdminRoleMutation } from "./adminRoles";

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("adminRoles server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
  });

  it("models roles query keys", () => {
    expect(adminRolesKeys.list()).toEqual(["admin", "roles", "list"]);
  });

  it("fetches roles via apiClient", async () => {
    mockApiGet.mockResolvedValue({ roles: [] });
    const { result } = renderHook(() => useAdminRolesQuery(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiGet).toHaveBeenCalledWith("/admin/roles");
  });

  it("creates roles via apiPost", async () => {
    mockApiPost.mockResolvedValue({ role: { id: "r1", name: "ops" } });
    const { result } = renderHook(() => useCreateAdminRoleMutation(), { wrapper: wrapper() });
    await result.current.mutateAsync({ name: "ops", displayName: "Ops" });
    expect(mockApiPost).toHaveBeenCalledWith("/admin/roles", expect.objectContaining({ name: "ops" }));
  });
});
