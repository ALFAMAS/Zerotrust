import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import WalletClient from "./WalletClient";

const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

function renderWallet() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WalletClient />
    </QueryClientProvider>
  );
}

describe("WalletPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("renders wallet balance and transactions", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/wallet") {
        return Promise.resolve({ balance: 2500, lifetimeBalance: 5000, currency: "USD" });
      }
      return Promise.resolve({
        data: [
          {
            id: "tx1",
            amount: 1000,
            balanceAfter: 2500,
            type: "top_up",
            description: "Manual top-up",
            createdAt: "2026-06-01T00:00:00Z",
          },
        ],
      });
    });

    renderWallet();

    expect(await screen.findByText("Manual top-up")).toBeInTheDocument();
    expect(screen.getAllByText((text) => text.includes("25.00")).length).toBeGreaterThan(0);
  });

  it("shows error state when wallet load fails", async () => {
    mockApiGet.mockRejectedValue(new Error("wallet unavailable"));
    renderWallet();

    expect(await screen.findByText("wallet unavailable")).toBeInTheDocument();
  });
});
