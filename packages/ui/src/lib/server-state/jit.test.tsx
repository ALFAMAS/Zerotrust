import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminJITPage from "@/app/admin/jit/page";
import DashboardJITPage from "@/app/dashboard/jit/page";
import { INCOMING_JIT_REQUESTS_PATH, MY_JIT_REQUESTS_PATH, jitKeys } from "./jit";

import { mockApiGet, mockApiPost } from "@/test/apiClientMock";
vi.mock("@/lib/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const pendingRequest = {
  id: "jit_1",
  requestorUserId: "user_1",
  requestorOrgId: "00000000-0000-0000-0000-0000000000aa",
  targetOrgId: "00000000-0000-0000-0000-0000000000bb",
  targetResource: "admin:users:read",
  justification: "Need access for audit",
  ttlSeconds: 3600,
  status: "pending" as const,
  createdAt: "2026-07-01T00:00:00Z",
};

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...result, queryClient };
}

function mockIncomingSuccess(requests = [pendingRequest]) {
  mockApiGet.mockImplementation((path: string) => {
    if (path === INCOMING_JIT_REQUESTS_PATH) {
      return Promise.resolve(requests);
    }
    return Promise.reject(new Error(`unexpected apiGet path ${path}`));
  });
}

describe("jit TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
  });

  it("models JIT domain query keys", () => {
    expect(jitKeys.incoming()).toEqual(["jit", "incoming"]);
    expect(jitKeys.myRequests()).toEqual(["jit", "myRequests"]);
  });

  it("renders incoming requests through apiClient/TanStack Query, not legacy api.get", async () => {
    mockIncomingSuccess();
    renderWithQueryClient(<AdminJITPage />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("admin:users:read")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(INCOMING_JIT_REQUESTS_PATH);
  });

  it("renders error + retry when the incoming list fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("jit unavailable"));
    renderWithQueryClient(<AdminJITPage />);

    expect(await screen.findByText("jit unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("uses targeted approve/deny mutations and invalidates the incoming list", async () => {
    mockIncomingSuccess();
    mockApiPost.mockImplementation((path: string) => {
      if (path === "/jit/cross-tenant/jit_1/approve") {
        return Promise.resolve({ ...pendingRequest, status: "approved" });
      }
      if (path === "/jit/cross-tenant/jit_1/deny") {
        return Promise.resolve({ ...pendingRequest, status: "denied" });
      }
      return Promise.reject(new Error(`unexpected apiPost path ${path}`));
    });

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<AdminJITPage />);
    await screen.findByText("admin:users:read");

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith("/jit/cross-tenant/jit_1/approve", {})
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: jitKeys.incoming() });

    mockApiGet.mockClear();
    mockIncomingSuccess([{ ...pendingRequest, status: "pending" }]);

    await user.click(screen.getByRole("button", { name: "Deny" }));
    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith("/jit/cross-tenant/jit_1/deny", {})
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: jitKeys.incoming() });
  });

  it("renders dashboard my-requests through apiClient/TanStack Query, not legacy api.get", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === MY_JIT_REQUESTS_PATH) {
        return Promise.resolve([pendingRequest]);
      }
      return Promise.reject(new Error(`unexpected apiGet path ${path}`));
    });

    renderWithQueryClient(<DashboardJITPage />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("admin:users:read")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(MY_JIT_REQUESTS_PATH);
  });

  it("submits JIT request and invalidates my-requests list", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === MY_JIT_REQUESTS_PATH) return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected apiGet path ${path}`));
    });
    mockApiPost.mockResolvedValue(pendingRequest);

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<DashboardJITPage />);
    await screen.findByText("You haven't requested any cross-tenant access yet.");

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.type(screen.getByLabelText("Target organization ID"), "00000000-0000-0000-0000-0000000000cc");
    await user.type(screen.getByLabelText("Resource"), "admin:users:read");
    await user.type(screen.getByLabelText("Justification"), "Need access for audit");
    await user.click(screen.getByRole("button", { name: "Request access" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith(MY_JIT_REQUESTS_PATH, {
        targetOrgId: "00000000-0000-0000-0000-0000000000cc",
        targetResource: "admin:users:read",
        justification: "Need access for audit",
        ttlSeconds: 3600,
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: jitKeys.myRequests() });
  });
});
