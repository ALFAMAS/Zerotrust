import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import AdminOverviewClient from "./AdminOverviewClient";

const stats = {
  totalUsers: 42,
  activeUsers: 30,
  activeSessions: 8,
  totalLogins24h: 15,
};

const recentUsers = [
  { id: "u1", name: "Alice", email: "alice@example.com", status: "active" },
];

function renderAdminOverview() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminOverviewClient />
    </QueryClientProvider>
  );
}

describe("AdminOverviewPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("renders metric cards and recent users", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/admin/stats") return Promise.resolve(stats);
      if (path.startsWith("/admin/users")) return Promise.resolve({ data: recentUsers });
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    renderAdminOverview();

    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Quick actions")).toBeInTheDocument();
  });

  it("shows error state when stats fail", async () => {
    mockApiGet.mockRejectedValue(new Error("admin unavailable"));
    renderAdminOverview();

    expect(await screen.findByText("admin unavailable")).toBeInTheDocument();
  });
});
