import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import TenantsPage from "./page";

function renderTenants() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TenantsPage />
    </QueryClientProvider>
  );
}

describe("TenantsPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    window.confirm = vi.fn(() => true);
  });

  it("renders tenant list", async () => {
    mockApiGet.mockResolvedValue({
      tenants: [
        {
          id: "ten1",
          slug: "acme",
          name: "Acme Corp",
          plan: "pro",
          status: "active",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
    });

    renderTenants();

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
  });
});
