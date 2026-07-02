import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import AdminRolesPage from "./page";

function renderRoles() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminRolesPage />
    </QueryClientProvider>
  );
}

describe("AdminRolesPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("renders system roles table", async () => {
    mockApiGet.mockResolvedValue({
      roles: [
        {
          id: "r1",
          name: "admin",
          displayName: "Administrator",
          description: "Full access",
          permissions: ["*"],
          parentRoleId: null,
          isSystem: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
    });

    renderRoles();

    expect(await screen.findByText("Administrator")).toBeInTheDocument();
  });
});
