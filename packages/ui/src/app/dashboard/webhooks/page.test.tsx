import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import WebhooksPage from "./page";

function renderWebhooks() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WebhooksPage />
    </QueryClientProvider>
  );
}

describe("WebhooksPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("renders webhook endpoints when loaded", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/webhooks") {
        return Promise.resolve([
          {
            id: "wh1",
            url: "https://example.com/hook",
            events: ["user.created"],
            active: true,
            createdAt: "2026-06-01T00:00:00Z",
          },
        ]);
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    });

    renderWebhooks();

    expect(await screen.findByText("https://example.com/hook")).toBeInTheDocument();
  });

  it("shows empty state when there are no endpoints", async () => {
    mockApiGet.mockResolvedValue([]);
    renderWebhooks();

    expect(await screen.findByText(/no webhook endpoints yet/i)).toBeInTheDocument();
  });
});
