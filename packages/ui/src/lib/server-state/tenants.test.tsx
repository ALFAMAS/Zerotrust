import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TenantsPage from "@/app/admin/tenants/page";
import { buildTenantsListPath, tenantKeys } from "./tenants";


import { mockApiGet, mockApiPost, mockApiPut, mockApiDelete } from "@/test/apiClientMock";
const tenants = [
  {
    id: "ten_1",
    slug: "acme-inc",
    name: "Acme Inc",
    displayName: "Acme Inc",
    status: "active" as const,
    plan: "starter" as const,
    createdAt: "2026-07-01T00:00:00Z",
  },
];

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

function mockTenantsSuccess(list = tenants) {
  mockApiGet.mockImplementation((path: string) => {
    if (path === "/admin/tenants?limit=100") {
      return Promise.resolve({ tenants: list, total: list.length });
    }
    return Promise.reject(new Error(`unexpected apiGet path ${path}`));
  });
}

describe("tenants TanStack Query server state", () => {
  
  it("models tenant domain query keys and list paths", () => {
    expect(tenantKeys.list({ limit: 100 })).toEqual(["tenants", "list", { limit: 100 }]);
    expect(buildTenantsListPath({ limit: 100 })).toBe("/admin/tenants?limit=100");
  });

  it("renders tenant data through apiClient/TanStack Query, not legacy api.get", async () => {
    mockTenantsSuccess();
    renderWithQueryClient(<TenantsPage />);

    expect(screen.getByText("Loading tenants…")).toBeInTheDocument();
    expect(await screen.findByText("acme-inc")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith("/admin/tenants?limit=100");
  });

  it("renders error + retry when the tenant list fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("tenants unavailable"));
    renderWithQueryClient(<TenantsPage />);

    expect(await screen.findByText("tenants unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("uses targeted mutations for plan change, suspend, and delete", async () => {
    mockTenantsSuccess();
    mockApiPost.mockResolvedValue({ ...tenants[0], plan: "pro" });
    mockApiPut.mockResolvedValue({ ...tenants[0], status: "suspended" });
    mockApiDelete.mockResolvedValue({ message: "Tenant deleted", id: "ten_1" });

    const user = userEvent.setup();
    renderWithQueryClient(<TenantsPage />);
    await screen.findByText("acme-inc");

    await user.click(screen.getByRole("combobox", { name: "" }));
    await user.click(await screen.findByRole("option", { name: "pro" }));
    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith("/admin/tenants/ten_1/plan", { plan: "pro" })
    );

    await user.click(screen.getByRole("button", { name: "Suspend" }));
    await waitFor(() =>
      expect(mockApiPut).toHaveBeenCalledWith("/admin/tenants/ten_1", { status: "suspended" })
    );

    await user.click(screen.getByRole("button", { name: "" }));
    await waitFor(() => expect(mockApiDelete).toHaveBeenCalledWith("/admin/tenants/ten_1"));
  });
});
