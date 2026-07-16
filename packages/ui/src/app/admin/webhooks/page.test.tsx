import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import AdminWebhookDeliveriesPage from "./page";

const deliveries = [
  {
    id: "delivery-1",
    webhookId: "webhook-123",
    event: "user.created",
    status: "delivered",
    attempt: 1,
    responseStatus: 204,
    error: null,
    recordedAt: "2026-07-15T10:00:00.000Z",
  },
  {
    id: "delivery-2",
    webhookId: "webhook-123",
    event: "invoice.failed",
    status: "failed",
    attempt: 3,
    responseStatus: 500,
    error: "upstream error",
    recordedAt: "2026-07-15T11:00:00.000Z",
  },
];

function renderWebhooks() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminWebhookDeliveriesPage />
    </QueryClientProvider>
  );
}

describe("Admin webhook deliveries", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockResolvedValue({
      data: deliveries,
      pagination: { page: 1, limit: 50, total: deliveries.length, totalPages: 1 },
    });
  });

  it("looks up a webhook and searches its loaded deliveries", async () => {
    const user = userEvent.setup();
    renderWebhooks();

    await user.type(screen.getByLabelText("Webhook ID"), "webhook-123");
    await user.click(screen.getByRole("button", { name: "Load deliveries" }));

    expect(await screen.findByText("user.created")).toBeInTheDocument();
    await waitFor(() =>
      expect(mockApiGet).toHaveBeenCalledWith(
        "/admin/webhooks/webhook-123/deliveries?limit=50"
      )
    );

    await user.type(
      screen.getByRole("searchbox", { name: "Search webhook deliveries" }),
      "failed"
    );
    expect(screen.queryByText("user.created")).not.toBeInTheDocument();
    expect(screen.getByText("invoice.failed")).toBeInTheDocument();
  });

  it("sorts deliveries and toggles column visibility", async () => {
    const user = userEvent.setup();
    renderWebhooks();
    await user.type(screen.getByLabelText("Webhook ID"), "webhook-123");
    await user.click(screen.getByRole("button", { name: "Load deliveries" }));

    const table = await screen.findByRole("table", { name: "Webhook deliveries" });
    const eventHeader = within(table).getByRole("columnheader", { name: "Event" });
    await user.click(within(table).getByRole("button", { name: "Event" }));
    expect(eventHeader).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "HTTP" }));
    expect(within(table).queryByText("204")).not.toBeInTheDocument();
  });

  it("shows an empty result after a successful lookup", async () => {
    mockApiGet.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
    const user = userEvent.setup();
    renderWebhooks();
    await user.type(screen.getByLabelText("Webhook ID"), "webhook-empty");
    await user.click(screen.getByRole("button", { name: "Load deliveries" }));

    expect(await screen.findByText("No deliveries found.")).toBeInTheDocument();
  });

  it("keeps query errors retryable", async () => {
    mockApiGet.mockRejectedValue(new Error("Delivery lookup failed"));
    const user = userEvent.setup();
    renderWebhooks();
    await user.type(screen.getByLabelText("Webhook ID"), "webhook-error");
    await user.click(screen.getByRole("button", { name: "Load deliveries" }));

    expect(await screen.findByText("Delivery lookup failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
