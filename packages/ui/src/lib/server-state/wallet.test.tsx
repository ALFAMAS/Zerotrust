import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WalletPage from "@/app/dashboard/wallet/page";
import {
  buildWalletTransactionPath,
  optimisticTopUpTransaction,
  walletKeys,
} from "./wallet";

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

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
    mockApiGet.mockReset();
    mockApiPost.mockReset();
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
    renderWithQueryClient(<WalletPage />);

    expect(screen.getByText("Loading wallet…")).toBeInTheDocument();
    expect(await screen.findByText((text) => text.includes("25.00"))).toBeInTheDocument();
    expect(screen.getByText("No transactions yet.")).toBeInTheDocument();
  });

  it("renders an explicit error state with retry when the wallet query fails", async () => {
    mockApiGet.mockRejectedValue(new Error("wallet offline"));
    renderWithQueryClient(<WalletPage />);

    expect(await screen.findByText("wallet offline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("marks stale cached data while a background refetch is in progress", async () => {
    mockWalletSuccess();
    const { queryClient } = renderWithQueryClient(<WalletPage />);
    expect(await screen.findByText("Initial top-up")).toBeInTheDocument();

    mockWalletSuccess({ delayed: true });
    await act(async () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.all });
    });

    expect(await screen.findByText("Refreshing wallet data…"));
    expect(screen.getByText("Showing cached wallet data while refreshing.")).toBeInTheDocument();
  });

  it("optimistically updates balance and transactions during a top-up, then invalidates targeted wallet keys", async () => {
    mockWalletSuccess({ delayed: true });
    let resolveTopUp: (value: unknown) => void = () => {};
    mockApiPost.mockReturnValue(new Promise((resolve) => (resolveTopUp = resolve)));
    const { queryClient } = renderWithQueryClient(<WalletPage />);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await waitFor(() => {
      expect(screen.getAllByText((text) => text.includes("25.00")).length).toBeGreaterThan(0);
    });

    await userEvent.clear(screen.getByLabelText("Amount (USD)"));
    await userEvent.type(screen.getByLabelText("Amount (USD)"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Top up" }));

    expect(mockApiPost).toHaveBeenCalledWith("/wallet/top-up", { amount: 1000 });
    await waitFor(() => {
      expect(screen.getAllByText((text) => text.includes("35.00")).length).toBeGreaterThan(0);
    });
    expect(
      within(screen.getByRole("table")).getByText("Top-up pending confirmation")
    ).toBeInTheDocument();
    expect(optimisticTopUpTransaction(wallet, 1000).balanceAfter).toBe(3500);

    resolveTopUp({});
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: walletKeys.detail() });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: walletKeys.transactions() });
    });
  });
});
