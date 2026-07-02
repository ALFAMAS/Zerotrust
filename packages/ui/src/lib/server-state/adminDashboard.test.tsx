import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminOverviewClient from "@/app/admin/AdminOverviewClient";
import { mockApiGet, mockApiGetBlob } from "@/test/apiClientMock";
import {
  ADMIN_STATS_PATH,
  ADMIN_USERS_EXPORT_PATH,
  adminDashboardKeys,
} from "@/lib/server-state/adminDashboard";

vi.mock("@/lib/hooks/useApi", () => ({
  useApi: () => {
    throw new Error("legacy useApi should not be called");
  },
}));

const stats = {
  totalUsers: 100,
  activeUsers: 80,
  activeSessions: 12,
  totalLogins24h: 45,
};

const recentUser = {
  id: "user_1",
  name: "Alice",
  email: "alice@example.com",
  status: "active",
  createdAt: "2026-07-01T00:00:00Z",
};

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("adminDashboard TanStack Query server state", () => {
  
  it("models admin dashboard query keys and paths", () => {
    expect(adminDashboardKeys.stats()).toEqual(["admin", "stats"]);
    expect(ADMIN_STATS_PATH).toBe("/admin/stats");
    expect(ADMIN_USERS_EXPORT_PATH).toBe("/admin/users/export");
  });

  it("renders admin overview through apiClient/TanStack Query", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === ADMIN_STATS_PATH) return Promise.resolve(stats);
      if (path.startsWith("/admin/users")) return Promise.resolve({ data: [recentUser] });
      return Promise.reject(new Error("unexpected"));
    });

    renderWithQueryClient(<AdminOverviewClient />);

    expect(await screen.findByText("100")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(ADMIN_STATS_PATH);
  });

  it("renders error + retry when admin stats fail", async () => {
    mockApiGet.mockRejectedValue(new Error("stats unavailable"));
    renderWithQueryClient(<AdminOverviewClient />);

    expect(await screen.findByText("stats unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("exports users via apiGetBlob mutation", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === ADMIN_STATS_PATH) return Promise.resolve(stats);
      if (path.startsWith("/admin/users")) return Promise.resolve({ data: [recentUser] });
      return Promise.reject(new Error("unexpected"));
    });
    mockApiGetBlob.mockResolvedValue(new Blob(["csv"]));

    const createElementSpy = vi.spyOn(document, "createElement");
    renderWithQueryClient(<AdminOverviewClient />);
    await screen.findByText("Alice");

    screen.getByRole("button", { name: /Export users/i }).click();

    await waitFor(() =>
      expect(mockApiGetBlob).toHaveBeenCalledWith(ADMIN_USERS_EXPORT_PATH)
    );
    createElementSpy.mockRestore();
  });
});
