import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAuditPage from "@/app/admin/audit/page";
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

  it("renders audit page entries and runs integrity verify on demand", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/admin/audit-logs") {
        return Promise.resolve({
          data: [
            {
              id: "a1",
              action: "login",
              actorEmail: "user@example.com",
              createdAt: "2026-07-01T00:00:00Z",
            },
          ],
        });
      }
      if (path === "/admin/audit-logs/verify") {
        return Promise.resolve({ ok: true, checked: 1 });
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 } },
          })
        }
      >
        <AdminAuditPage />
      </QueryClientProvider>
    );

    expect(await screen.findByText("login")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Verify integrity" }));
    expect(await screen.findByText(/Hash chain intact/i)).toBeInTheDocument();
  });
});
