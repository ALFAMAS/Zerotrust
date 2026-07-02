import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ApiKeysPage from "@/app/dashboard/api-keys/page";
import { API_KEYS_PATH, apiKeyKeys, buildApiKeyPath } from "./apiKeys";


import { mockApiGet, mockApiPost, mockApiDelete } from "@/test/apiClientMock";
const apiKey = {
  id: "key_1",
  name: "CI pipeline",
  environment: "live" as const,
  keyPrefix: "zak_live_abc",
  scopes: [],
  expiresAt: null,
  lastUsedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
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

describe("apiKeys TanStack Query server state", () => {
  beforeEach(() => {
    vi.stubGlobal("confirm", () => true);
  });

  it("models apiKeys domain query keys and paths", () => {
    expect(apiKeyKeys.list()).toEqual(["apiKeys", "list"]);
    expect(API_KEYS_PATH).toBe("/api-keys");
    expect(buildApiKeyPath("key_1")).toBe("/api-keys/key_1");
  });

  it("renders API keys through apiClient/TanStack Query, not legacy api.get", async () => {
    mockApiGet.mockResolvedValue([apiKey]);
    renderWithQueryClient(<ApiKeysPage />);

    expect(await screen.findByText("CI pipeline")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(API_KEYS_PATH);
  });

  it("renders error + retry when API keys list fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("keys unavailable"));
    renderWithQueryClient(<ApiKeysPage />);

    expect(await screen.findByText("keys unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("revokes an API key via mutation with list invalidation", async () => {
    mockApiGet.mockResolvedValue([apiKey]);
    mockApiDelete.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<ApiKeysPage />);
    await screen.findByText("CI pipeline");

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(mockApiDelete).toHaveBeenCalledWith("/api-keys/key_1"));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: apiKeyKeys.list() });
  });
});
