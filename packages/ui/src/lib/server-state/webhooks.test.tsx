import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WebhooksPage from "@/app/dashboard/webhooks/page";
import { buildWebhookDeliveriesPath, webhookKeys } from "./webhooks";

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPatch = vi.fn();
const mockApiDelete = vi.fn();
const mockLegacyGet = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockLegacyGet(...args),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const endpoints = [
  {
    id: "wh_1",
    url: "https://example.com/webhooks/zerotrust",
    events: ["auth.login.success", "user.created"],
    active: true,
    createdAt: "2026-07-01T00:00:00Z",
  },
];

const deliveries = [
  {
    id: "del_1",
    event: "auth.login.success",
    status: "delivered" as const,
    attempt: 1,
    responseStatus: 200,
    error: null,
    recordedAt: "2026-07-01T01:00:00Z",
  },
];

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

function mockWebhookSuccess(list = endpoints) {
  mockApiGet.mockImplementation((path: string) => {
    if (path === "/webhooks") return Promise.resolve(list);
    if (path === "/webhooks/wh_1/deliveries?limit=50") return Promise.resolve({ deliveries });
    return Promise.reject(new Error(`unexpected apiGet path ${path}`));
  });
}

describe("webhooks TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiPatch.mockReset();
    mockApiDelete.mockReset();
    mockLegacyGet.mockReset();
    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
  });

  it("models webhook domain query keys and delivery paths", () => {
    expect(webhookKeys.list()).toEqual(["webhooks", "list", {}]);
    expect(webhookKeys.deliveries("wh_1", { limit: 50 })).toEqual([
      "webhooks",
      "detail",
      "wh_1",
      "deliveries",
      { limit: 50 },
    ]);
    expect(buildWebhookDeliveriesPath("wh_1", { limit: 50 })).toBe(
      "/webhooks/wh_1/deliveries?limit=50"
    );
  });

  it("renders endpoint data through apiClient/TanStack Query, not legacy api.get", async () => {
    mockWebhookSuccess();
    renderWithQueryClient(<WebhooksPage />);

    expect(screen.getByText("Loading webhooks…")).toBeInTheDocument();
    expect(await screen.findByText("https://example.com/webhooks/zerotrust")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith("/webhooks");
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("renders error + retry and empty states", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("webhooks unavailable"));
    renderWithQueryClient(<WebhooksPage />);

    expect(await screen.findByText("webhooks unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("renders an empty endpoint state when the list is empty", async () => {
    mockWebhookSuccess([]);
    renderWithQueryClient(<WebhooksPage />);

    expect(await screen.findByText("No webhook endpoints yet")).toBeInTheDocument();
  });

  it("uses targeted mutations for toggle, ping, delivery logs, and delete", async () => {
    mockWebhookSuccess();
    let resolvePatch: (value: unknown) => void = () => {};
    mockApiPatch.mockReturnValue(new Promise((resolve) => (resolvePatch = resolve)));
    mockApiPost.mockResolvedValue(deliveries[0]);
    mockApiDelete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<WebhooksPage />);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await screen.findByText("https://example.com/webhooks/zerotrust");

    await user.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith("/webhooks/wh_1", { active: false });
    });
    expect(screen.getByRole("button", { name: "Enable" })).toBeInTheDocument();
    resolvePatch({ ...endpoints[0], active: false });

    await user.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith("/webhooks/wh_1/ping", {});
    });
    expect(await screen.findByText("✓ delivered")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deliveries" }));
    expect(await screen.findByText("Recent deliveries")).toBeInTheDocument();
    expect(await screen.findByText("auth.login.success")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith("/webhooks/wh_1/deliveries?limit=50");

    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith("/webhooks/wh_1");
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: webhookKeys.list() });
    });
  });
});
