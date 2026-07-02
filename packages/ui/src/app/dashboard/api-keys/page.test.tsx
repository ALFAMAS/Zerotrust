import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import ApiKeysPage from "./page";

function renderApiKeys() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiKeysPage />
    </QueryClientProvider>
  );
}

describe("ApiKeysPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("renders API keys list", async () => {
    mockApiGet.mockResolvedValue([
      {
        id: "k1",
        name: "CI token",
        keyPrefix: "zak_live_abc",
        environment: "live",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ]);

    renderApiKeys();

    expect(await screen.findByText("CI token")).toBeInTheDocument();
  });

  it("shows empty state when there are no keys", async () => {
    mockApiGet.mockResolvedValue([]);
    renderApiKeys();

    expect(await screen.findByText(/no active api keys/i)).toBeInTheDocument();
  });
});
