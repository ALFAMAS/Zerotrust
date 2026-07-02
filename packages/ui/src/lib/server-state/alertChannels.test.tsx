import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAlertsPage from "@/app/admin/alerts/page";
import { mockApiGet, mockApiPost, mockApiPatch, mockApiDelete } from "@/test/apiClientMock";
import {
  ALERT_CHANNELS_PATH,
  alertChannelKeys,
  buildAlertChannelPath,
  buildAlertChannelTestPath,
  useCreateAlertChannelMutation,
  useDeleteAlertChannelMutation,
  useTestAlertChannelMutation,
  useToggleAlertChannelMutation,
} from "./alertChannels";

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const channel = {
  id: "ch_1",
  type: "slack" as const,
  name: "Security on-call",
  enabled: true,
  events: ["anomaly.detected"],
  config: { webhookUrl: "https://hooks.slack.com/test" },
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

function hookWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    Wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe("alertChannels TanStack Query server state", () => {
  beforeEach(() => {
    vi.stubGlobal("confirm", () => true);
  });

  it("models alert channel domain query keys and paths", () => {
    expect(alertChannelKeys.list()).toEqual(["admin", "alertChannels", "list"]);
    expect(ALERT_CHANNELS_PATH).toBe("/admin/notifications/channels");
    expect(buildAlertChannelPath("ch_1")).toBe("/admin/notifications/channels/ch_1");
    expect(buildAlertChannelTestPath("ch_1")).toBe("/admin/notifications/channels/ch_1/test");
  });

  it("renders channels through apiClient/TanStack Query, not legacy api.get", async () => {
    mockApiGet.mockResolvedValue({ channels: [channel] });
    renderWithQueryClient(<AdminAlertsPage />);

    expect(await screen.findByText("Security on-call")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(ALERT_CHANNELS_PATH);
  });

  it("renders error + retry when channel list fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("channels unavailable"));
    renderWithQueryClient(<AdminAlertsPage />);

    expect(await screen.findByText("channels unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("toggles channel enabled state via patch mutation with list invalidation", async () => {
    mockApiGet.mockResolvedValue({ channels: [channel] });
    mockApiPatch.mockResolvedValue({ ...channel, enabled: false });

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<AdminAlertsPage />);
    await screen.findByText("Security on-call");

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("switch", { name: "Enabled" }));

    await waitFor(() =>
      expect(mockApiPatch).toHaveBeenCalledWith("/admin/notifications/channels/ch_1", {
        enabled: false,
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: alertChannelKeys.list(),
    });
  });

  it("creates a channel via mutation and invalidates the list", async () => {
    mockApiPost.mockResolvedValue(channel);
    const { Wrapper, queryClient } = hookWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateAlertChannelMutation(), { wrapper: Wrapper });

    await result.current.mutateAsync({
      type: "slack",
      name: "Security on-call",
      events: ["anomaly.detected"],
      config: { webhookUrl: "https://hooks.slack.com/test" },
    });

    expect(mockApiPost).toHaveBeenCalledWith(ALERT_CHANNELS_PATH, {
      type: "slack",
      name: "Security on-call",
      events: ["anomaly.detected"],
      config: { webhookUrl: "https://hooks.slack.com/test" },
    });
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: alertChannelKeys.list() })
    );
  });

  it("sends a test alert via mutation", async () => {
    mockApiPost.mockResolvedValue({ ok: true });
    const { Wrapper } = hookWrapper();
    const { result } = renderHook(() => useTestAlertChannelMutation(), { wrapper: Wrapper });

    await result.current.mutateAsync("ch_1");

    expect(mockApiPost).toHaveBeenCalledWith(buildAlertChannelTestPath("ch_1"));
  });

  it("deletes a channel from the admin page", async () => {
    mockApiGet.mockResolvedValue({ channels: [channel] });
    mockApiDelete.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    renderWithQueryClient(<AdminAlertsPage />);
    await screen.findByText("Security on-call");
    await user.click(screen.getByRole("button", { name: "Delete Security on-call" }));

    await waitFor(() =>
      expect(mockApiDelete).toHaveBeenCalledWith("/admin/notifications/channels/ch_1")
    );
  });

  it("rolls back optimistic delete when the mutation fails", async () => {
    const listKey = alertChannelKeys.list();
    const initial = { channels: [channel] };
    const { Wrapper, queryClient } = hookWrapper();
    queryClient.setQueryData(listKey, initial);
    mockApiDelete.mockRejectedValueOnce(new Error("delete failed"));

    const { result } = renderHook(() => useDeleteAlertChannelMutation(), { wrapper: Wrapper });
    await expect(result.current.mutateAsync("ch_1")).rejects.toThrow("delete failed");
    expect(queryClient.getQueryData(listKey)).toEqual(initial);
  });

  it("rolls back optimistic toggle when the mutation fails", async () => {
    const listKey = alertChannelKeys.list();
    const initial = { channels: [channel] };
    const { Wrapper, queryClient } = hookWrapper();
    queryClient.setQueryData(listKey, initial);
    mockApiPatch.mockRejectedValueOnce(new Error("toggle failed"));

    const { result } = renderHook(() => useToggleAlertChannelMutation(), { wrapper: Wrapper });
    await expect(result.current.mutateAsync({ id: "ch_1", enabled: false })).rejects.toThrow(
      "toggle failed"
    );
    expect(queryClient.getQueryData(listKey)).toEqual(initial);
  });
});
