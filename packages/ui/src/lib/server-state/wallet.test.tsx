import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WalletClient from "@/app/dashboard/wallet/WalletClient";
import { mockApiGet, mockApiPost } from "@/test/apiClientMock";
import { buildWalletTransactionPath, walletKeys } from "./wallet";

const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("@/lib/safeRedirect", () => ({
  navigateToSafeExternal: vi.fn(),
}));

import { navigateToSafeExternal } from "@/lib/safeRedirect";

const wallet = {
  balance: 2500,
  lifetimeBalance: 5000,
  currency: "USD",
  autoTopUp: false,
};

const transactions = [
  {
    id: "tx_1",
    amount: 2500,
    balanceAfter: 2500,
    type: "top_up",
    description: "Initial top-up",
    createdAt: "2026-07-01T12:00:00Z",
  },
];

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );

  return { ...result, queryClient };
}

function mockWalletSuccess(overrides?: { txs?: typeof transactions; delayed?: boolean }) {
  mockApiGet.mockImplementation((path: string) => {
    const response = path === "/wallet" ? wallet : { data: overrides?.txs ?? transactions };
    return overrides?.delayed
      ? new Promise((resolve) => setTimeout(() => resolve(response), 150))
      : Promise.resolve(response);
  });
}

describe("wallet TanStack Query server state", () => {
  beforeEach(() => {
    vi.mocked(navigateToSafeExternal).mockReset();
  });

  it("models wallet domain query keys and colocated query paths", () => {
    expect(walletKeys.detail()).toEqual(["wallet", "detail"]);
    expect(walletKeys.transactions({ limit: 30 })).toEqual([
      "wallet",
      "transactions",
      { limit: 30 },
    ]);
    expect(buildWalletTransactionPath({ limit: 30 })).toBe("/wallet/transactions?limit=30");
  });

  it("renders loading, fetched data, and an empty transaction state", async () => {
    mockWalletSuccess({ txs: [] });
    renderWithQueryClient(<WalletClient />);

    expect(screen.getByText("Loading wallet…")).toBeInTheDocument();
    expect(await screen.findByText((text) => text.includes("25.00"))).toBeInTheDocument();
    expect(screen.getByText("No transactions yet.")).toBeInTheDocument();
  });

  it("renders an explicit error state with retry when the wallet query fails", async () => {
    mockApiGet.mockRejectedValue(new Error("wallet offline"));
    renderWithQueryClient(<WalletClient />);

    expect(await screen.findByText("wallet offline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("marks stale cached data while a background refetch is in progress", async () => {
    mockWalletSuccess();
    const { queryClient } = renderWithQueryClient(<WalletClient />);
    expect(await screen.findByText("Initial top-up")).toBeInTheDocument();

    mockWalletSuccess({ delayed: true });
    await act(async () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.all });
    });

    expect(await screen.findByText("Refreshing wallet data…"));
    expect(screen.getByText("Showing cached wallet data while refreshing.")).toBeInTheDocument();
  });

  it("starts Stripe Checkout and redirects instead of crediting balance immediately", async () => {
    mockWalletSuccess();
    mockApiPost.mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay/cs_test",
      sessionId: "cs_test",
    });

    renderWithQueryClient(<WalletClient />);

    await waitFor(() => {
      expect(screen.getAllByText((text) => text.includes("25.00")).length).toBeGreaterThan(0);
    });

    await userEvent.clear(screen.getByLabelText("Amount (USD)"));
    await userEvent.type(screen.getByLabelText("Amount (USD)"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Pay with Stripe" }));

    expect(mockApiPost).toHaveBeenCalledWith("/wallet/top-up", { amount: 1000 });
    await waitFor(() => {
      expect(navigateToSafeExternal).toHaveBeenCalledWith(
        "https://checkout.stripe.com/c/pay/cs_test",
        "/dashboard/wallet"
      );
    });
    expect(screen.getAllByText((text) => text.includes("25.00")).length).toBeGreaterThan(0);
  });
});
