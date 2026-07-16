import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import AuditClient from "./AuditClient";

const entries = [
  {
    id: "audit-1",
    action: "auth.login",
    actorEmail: "ada@example.com",
    ipAddress: "203.0.113.10",
    success: true,
    createdAt: "2026-07-15T10:00:00.000Z",
    metadata: { method: "password" },
  },
  {
    id: "audit-2",
    action: "admin.user.suspend",
    actorEmail: "grace@example.com",
    ipAddress: "198.51.100.20",
    success: false,
    createdAt: "2026-07-15T11:00:00.000Z",
  },
];

function renderAudit() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditClient />
    </QueryClientProvider>
  );
}

describe("Admin audit logs", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/admin/audit-logs/verify") {
        return Promise.resolve({ ok: true, checked: entries.length });
      }
      return Promise.resolve({ data: entries, pagination: { total: entries.length } });
    });
  });

  it("searches the audit entries loaded on the current page", async () => {
    const user = userEvent.setup();
    renderAudit();

    await screen.findByText("auth.login");
    await user.type(screen.getByRole("searchbox", { name: "Search audit logs" }), "grace");

    expect(screen.queryByText("auth.login")).not.toBeInTheDocument();
    expect(screen.getByText("admin.user.suspend")).toBeInTheDocument();
    expect(screen.getByText("Search applies to this page only.")).toBeInTheDocument();
  });

  it("opens audit details from an explicit row action", async () => {
    const user = userEvent.setup();
    renderAudit();

    const action = await screen.findByText("auth.login");
    const row = action.closest("tr");
    expect(row).not.toBeNull();
    await user.click(within(row!).getByRole("button", { name: "View details" }));

    expect(screen.getByRole("dialog", { name: "Audit log detail" })).toBeInTheDocument();
    expect(screen.getByText(/"method": "password"/)).toBeInTheDocument();
  });

  it("keeps integrity verification available", async () => {
    const user = userEvent.setup();
    renderAudit();
    await screen.findByText("auth.login");

    await user.click(screen.getByRole("button", { name: "Verify integrity" }));

    expect(await screen.findByText(/Hash chain intact/)).toHaveTextContent(
      "verified 2 chained entries"
    );
  });

  it("shows an empty table state", async () => {
    mockApiGet.mockResolvedValue({ data: [], pagination: { total: 0 } });
    renderAudit();

    expect(await screen.findByText("No audit entries found.")).toBeInTheDocument();
  });

  it("exposes sorting and column visibility controls", async () => {
    const user = userEvent.setup();
    renderAudit();

    const table = await screen.findByRole("table", { name: "Audit logs" });
    const timestampHeader = within(table).getByRole("columnheader", { name: "Timestamp" });
    await user.click(within(table).getByRole("button", { name: "Timestamp" }));
    expect(timestampHeader).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "IP" }));
    expect(within(table).queryByText("203.0.113.10")).not.toBeInTheDocument();
  });
});
