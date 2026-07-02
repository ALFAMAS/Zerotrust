import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NpsSurveyPrompt } from "@/components/NpsSurveyPrompt";
import { NPS_SHOULD_PROMPT_PATH, NPS_SUBMIT_PATH, npsKeys } from "./nps";

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

describe("nps TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockLegacyGet.mockReset();
    mockLegacyPost.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("models nps domain query keys and paths", () => {
    expect(npsKeys.shouldPrompt()).toEqual(["nps", "shouldPrompt"]);
    expect(NPS_SHOULD_PROMPT_PATH).toBe("/auth/me/nps/should-prompt");
    expect(NPS_SUBMIT_PATH).toBe("/auth/me/nps");
  });

  it("shows NPS prompt when should-prompt returns true via apiClient", async () => {
    mockApiGet.mockResolvedValue({ shouldPrompt: true });
    renderWithQueryClient(<NpsSurveyPrompt />);

    expect(
      await screen.findByText(/How likely are you to recommend zerotrust/)
    ).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(NPS_SHOULD_PROMPT_PATH);
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("hides NPS prompt when should-prompt returns false", async () => {
    mockApiGet.mockResolvedValue({ shouldPrompt: false });
    renderWithQueryClient(<NpsSurveyPrompt />);

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith(NPS_SHOULD_PROMPT_PATH));
    expect(screen.queryByText(/How likely are you to recommend zerotrust/)).not.toBeInTheDocument();
  });

  it("submits NPS feedback via mutation, not legacy api.post", async () => {
    mockApiGet.mockResolvedValue({ shouldPrompt: true });
    mockApiPost.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    renderWithQueryClient(<NpsSurveyPrompt />);

    await screen.findByText(/How likely are you to recommend zerotrust/);
    await user.click(screen.getByRole("button", { name: "9" }));
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith(NPS_SUBMIT_PATH, { score: 9 })
    );
    expect(mockLegacyPost).not.toHaveBeenCalled();
  });
});
