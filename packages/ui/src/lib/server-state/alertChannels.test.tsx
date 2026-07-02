import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAlertsPage from "@/app/admin/alerts/page";
import { mockApiGet, mockApiPost, mockApiPatch, mockApiDelete } from "@/test/apiClientMock";
import {
  ALERT_CHANNELS_PATH,
  alertChannelKeys,
  buildAlertChannelPath,
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

describe("alertChannels TanStack Query server state", () => {
  beforeEach(() => {
    vi.stubGlobal("confirm", () => true);
  });

  it("models alert channel domain query keys and paths", () => {
    expect(alertChannelKeys.list()).toEqual(["admin", "alertChannels", "list"]);
    expect(ALERT_CHANNELS_PATH).toBe("/admin/notifications/channels");
    expect(buildAlertChannelPath("ch_1")).toBe("/admin/notifications/channels/ch_1");
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
});
