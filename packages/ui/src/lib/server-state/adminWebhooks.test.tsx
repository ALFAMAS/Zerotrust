import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import {
  adminWebhookKeys,
  buildAdminWebhookDeliveriesPath,
  useAdminWebhookDeliveriesQuery,
} from "./adminWebhooks";

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("adminWebhooks server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("models webhook delivery query keys and paths", () => {
    expect(adminWebhookKeys.list("wh_1", { limit: 50 })).toEqual([
      "admin",
      "webhookDeliveries",
      "wh_1",
      { limit: 50 },
    ]);
    expect(buildAdminWebhookDeliveriesPath("wh_1", { limit: 50 })).toBe(
      "/admin/webhooks/wh_1/deliveries?limit=50"
    );
    expect(buildAdminWebhookDeliveriesPath("wh_1")).toBe("/admin/webhooks/wh_1/deliveries");
  });

  it("fetches admin webhook deliveries via apiClient", async () => {
    mockApiGet.mockResolvedValue({ data: [], pagination: { total: 0 } });
    const { result } = renderHook(() => useAdminWebhookDeliveriesQuery("wh_1", { limit: 50 }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiGet).toHaveBeenCalledWith("/admin/webhooks/wh_1/deliveries?limit=50");
  });

  it("surfaces loading and error states", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("deliveries unavailable"));
    const { result } = renderHook(() => useAdminWebhookDeliveriesQuery("wh_1"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("deliveries unavailable");
  });

  it("stays idle when webhookId is empty", () => {
    const { result } = renderHook(() => useAdminWebhookDeliveriesQuery(""), { wrapper: wrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});
