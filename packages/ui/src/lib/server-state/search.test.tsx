import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SearchPage from "@/app/dashboard/search/page";
import { buildSearchPath, searchKeys } from "./search";

const mockApiGet = vi.fn();
const mockLegacyGet = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockLegacyGet(...args),
  },
}));

const results = {
  total: 1,
  provider: "database" as const,
  hits: [
    {
      id: "user_1",
      type: "user" as const,
      title: "user@example.com",
      highlight: "user@<em>example</em>.com",
      score: 1,
    },
  ],
};

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });

  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...result, queryClient };
}

describe("search TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockLegacyGet.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("models search domain query keys and paths", () => {
    expect(searchKeys.results({ q: "alice", limit: 25 })).toEqual([
      "search",
      "results",
      { q: "alice", limit: 25 },
    ]);
    expect(buildSearchPath({ q: "alice", limit: 25 })).toBe("/search?q=alice&limit=25");
    expect(buildSearchPath({ q: "alice", type: "user", limit: 25 })).toBe(
      "/search?q=alice&limit=25&type=user"
    );
  });

  it("does not fetch until query is at least 2 characters", async () => {
    renderWithQueryClient(<SearchPage />);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    await user.type(screen.getByLabelText("Search query"), "a");

    await vi.advanceTimersByTimeAsync(350);
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("searches through apiClient/TanStack Query after debounce, not legacy api", async () => {
    mockApiGet.mockResolvedValue(results);

    renderWithQueryClient(<SearchPage />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });

    await user.type(screen.getByLabelText("Search query"), "user");
    await vi.advanceTimersByTimeAsync(350);

    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith("/search?q=user&limit=25");
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("shows empty state when search returns no hits", async () => {
    mockApiGet.mockResolvedValue({ total: 0, hits: [], provider: "database" });

    renderWithQueryClient(<SearchPage />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });

    await user.type(screen.getByLabelText("Search query"), "missing");
    await vi.advanceTimersByTimeAsync(350);

    expect(await screen.findByText(/No results for/)).toBeInTheDocument();
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
  });
});
