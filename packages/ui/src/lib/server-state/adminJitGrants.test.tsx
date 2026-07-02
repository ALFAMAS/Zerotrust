import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet, mockApiPost } from "@/test/apiClientMock";
import {
  adminJitGrantsKeys,
  buildAdminJitGrantsPath,
  useAdminJitGrantsQuery,
} from "./adminJitGrants";

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("adminJitGrants server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("models jit grants keys and paths", () => {
    expect(adminJitGrantsKeys.list({ status: "pending" })).toEqual([
      "admin",
      "jitGrants",
      "list",
      { status: "pending" },
    ]);
    expect(buildAdminJitGrantsPath({ status: "pending" })).toBe("/admin/jit-grants?status=pending");
  });

  it("fetches grants via apiClient", async () => {
    mockApiGet.mockResolvedValue({ grants: [] });
    const { result } = renderHook(() => useAdminJitGrantsQuery({ status: "pending" }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiGet).toHaveBeenCalledWith("/admin/jit-grants?status=pending");
  });
});
