import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RevenuePage from "@/app/admin/revenue/page";
import { BROADCAST_PATH, REVENUE_PATH, revenueKeys } from "./revenue";

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockLegacyGet = vi.fn();
const mockLegacyPost = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockLegacyGet(...args),
    post: (...args: unknown[]) => mockLegacyPost(...args),
  },
}));

const revenue = {
  mrr: 1200,
  arr: 14400,
  currency: "usd",
  activeSubscriptions: 10,
  byPlan: { pro: 8, enterprise: 2 },
  trialing: 1,
  pastDue: 0,
  canceledLast30Days: 1,
  churnRatePercent: 5,
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

describe("revenue TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockLegacyGet.mockReset();
    mockLegacyPost.mockReset();
  });

  it("models revenue domain query keys and paths", () => {
    expect(revenueKeys.summary()).toEqual(["admin", "revenue", "summary"]);
    expect(REVENUE_PATH).toBe("/admin/revenue");
    expect(BROADCAST_PATH).toBe("/admin/broadcast");
  });

  it("renders revenue metrics through apiClient/TanStack Query, not legacy api", async () => {
    mockApiGet.mockResolvedValue(revenue);

    renderWithQueryClient(<RevenuePage />);

    expect(await screen.findByText("MRR")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(REVENUE_PATH);
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("renders error + retry when revenue fetch fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("revenue unavailable"));
    renderWithQueryClient(<RevenuePage />);

    expect(await screen.findByText("revenue unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("sends broadcast via mutation", async () => {
    mockApiGet.mockResolvedValue(revenue);
    mockApiPost.mockResolvedValue({ recipients: 42 });

    const user = userEvent.setup();
    renderWithQueryClient(<RevenuePage />);
    await screen.findByText("MRR");

    await user.click(screen.getByRole("button", { name: "Broadcast" }));
    await user.type(screen.getByPlaceholderText("Title"), "Maintenance");
    await user.type(screen.getByPlaceholderText("Message"), "Scheduled downtime");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith(BROADCAST_PATH, {
        title: "Maintenance",
        message: "Scheduled downtime",
        segment: "all",
        sendEmail: false,
      })
    );
    expect(mockLegacyPost).not.toHaveBeenCalled();
  });
});
