import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import SupportPage from "./page";

function renderSupport() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SupportPage />
    </QueryClientProvider>
  );
}

describe("SupportPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("renders support tickets list", async () => {
    mockApiGet.mockResolvedValue({
      tickets: [
        {
          id: "t1",
          subject: "Billing question",
          status: "open",
          createdAt: "2026-06-01T00:00:00Z",
          updatedAt: "2026-06-01T00:00:00Z",
        },
      ],
    });

    renderSupport();

    expect(await screen.findByText("Billing question")).toBeInTheDocument();
  });

  it("shows empty state when there are no tickets", async () => {
    mockApiGet.mockResolvedValue({ tickets: [] });
    renderSupport();

    expect(await screen.findByText(/no support tickets yet/i)).toBeInTheDocument();
  });
});
