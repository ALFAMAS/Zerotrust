import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StatusPage from "@/app/status/page";
import { STATUS_PATH, statusKeys } from "@/lib/server-state/status";

import { mockApiGet } from "@/test/apiClientMock";
vi.mock("@/components/SiteHeader", () => ({ default: () => <div>header</div> }));
vi.mock("@/components/SiteFooter", () => ({ default: () => <div>footer</div> }));

const statusData = {
  status: "operational" as const,
  components: {
    api: "operational" as const,
    database: "operational" as const,
  },
  uptimeSeconds: 7200,
  timestamp: "2026-07-03T00:00:00Z",
};

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("status TanStack Query server state", () => {
  beforeEach(() => {
    class MockEventSource {
      close = vi.fn();
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(_url: string) {}
    }
    vi.stubGlobal("EventSource", MockEventSource);
  });

  it("models status domain query keys and paths", () => {
    expect(statusKeys.current()).toEqual(["status", "current"]);
    expect(STATUS_PATH).toBe("/status");
  });

  it("renders status page through apiClient/TanStack Query", async () => {
    mockApiGet.mockResolvedValue(statusData);
    renderWithQueryClient(<StatusPage />);

    expect(await screen.findByText("All systems operational")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(STATUS_PATH, { skipAuth: true });
  });

  it("renders error + retry when status fetch fails", async () => {
    mockApiGet.mockRejectedValue(new Error("status unavailable"));
    renderWithQueryClient(<StatusPage />);

    expect(await screen.findByText("status unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("subscribes to SSE stream for live updates", async () => {
    mockApiGet.mockResolvedValue(statusData);
    renderWithQueryClient(<StatusPage />);
    await screen.findByText("All systems operational");

    await waitFor(() => expect(globalThis.EventSource).toBeDefined());
  });
});
