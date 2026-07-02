import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditKeys, useAuditEntriesQuery, useAuditVerifyQuery } from "./audit";
import { mockApiGet } from "@/test/apiClientMock";

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return {
    queryClient,
    Wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe("audit TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("models audit query keys", () => {
    expect(auditKeys.entries()).toEqual(["audit", "entries", {}]);
    expect(auditKeys.verify()).toEqual(["audit", "verify"]);
  });

  it("fetches audit entries through apiClient", async () => {
    mockApiGet.mockResolvedValue({ data: [{ id: "a1", action: "login" }] });
    const { Wrapper } = wrapper();

    const { result } = renderHook(() => useAuditEntriesQuery(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data?.data?.length).toBe(1));
    expect(mockApiGet).toHaveBeenCalledWith("/admin/audit-logs");
  });

    it("does not auto-fetch verify (enabled: false) and fetches on refetch", async () => {
    mockApiGet.mockResolvedValue({ ok: true, checked: 5 });
    const { Wrapper } = wrapper();

    const { result } = renderHook(() => useAuditVerifyQuery(), { wrapper: Wrapper });

    // Verify is not auto-fetched (enabled: false → fetchStatus idle)
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();

    await result.current.refetch();
    await waitFor(() => expect(result.current.data?.ok).toBe(true));
    expect(mockApiGet).toHaveBeenCalledWith("/admin/audit-logs/verify");
  });
});
