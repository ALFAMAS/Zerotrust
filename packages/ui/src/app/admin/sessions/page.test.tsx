import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiDelete, mockApiGet } from "@/test/apiClientMock";

import SessionsClient from "./SessionsClient";

const sessions = [
  {
    id: "s1",
    userId: "u1",
    userEmail: "ada@example.com",
    userDisplayName: "Ada Lovelace",
    deviceFingerprint: { browser: "Firefox", os: "Windows", isTrusted: true },
    ipAddress: "203.0.113.10",
    country: "US",
    isActive: true,
    revokedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    lastActivityAt: "2026-01-02T00:00:00Z",
    expiresAt: "2099-01-01T00:00:00Z",
  },
  {
    id: "s2",
    userId: "u2",
    userEmail: "grace@example.com",
    userDisplayName: "Grace Hopper",
    deviceFingerprint: { browser: "Safari", os: "macOS", isTrusted: false },
    ipAddress: "198.51.100.20",
    country: "AU",
    isActive: false,
    revokedAt: null,
    createdAt: "2026-02-01T00:00:00Z",
    lastActivityAt: "2026-02-02T00:00:00Z",
    expiresAt: "2026-03-01T00:00:00Z",
  },
];

function mockSessionsResponse(page = 1, totalPages = 2) {
  mockApiGet.mockResolvedValue({
    data: sessions,
    pagination: {
      page,
      limit: 20,
      total: sessions.length,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
}

function renderSessions() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionsClient />
    </QueryClientProvider>
  );
}

describe("Admin SessionsPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiDelete.mockReset();
    window.confirm = vi.fn(() => true);
  });

  it("loads and displays sessions", async () => {
    mockSessionsResponse();
    renderSessions();

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalled();
  });

  it("searches the sessions loaded on the current page", async () => {
    mockSessionsResponse();
    const user = userEvent.setup();
    renderSessions();

    await screen.findByText("Ada Lovelace");
    await user.type(screen.getByRole("searchbox", { name: "Search sessions" }), "safari");

    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Search applies to this page only.")).toBeInTheDocument();
  });

  it("sorts and hides columns through the shared table controls", async () => {
    mockSessionsResponse();
    const user = userEvent.setup();
    renderSessions();

    const table = await screen.findByRole("table", { name: "Admin sessions" });
    const userHeader = within(table).getByRole("columnheader", { name: "User" });
    expect(userHeader).toHaveAttribute("aria-sort", "none");

    await user.click(within(table).getByRole("button", { name: "User" }));
    expect(userHeader).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Location" }));
    expect(within(table).queryByText("203.0.113.10")).not.toBeInTheDocument();
  });

  it("keeps the active and expired session tabs", async () => {
    mockSessionsResponse();
    const user = userEvent.setup();
    renderSessions();
    await screen.findByText("Ada Lovelace");

    await user.click(screen.getByRole("button", { name: "Expired" }));
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });

  it("revokes a session via apiClient delete", async () => {
    mockSessionsResponse();
    mockApiDelete.mockResolvedValue({});
    const user = userEvent.setup();
    renderSessions();

    await screen.findByText("Ada Lovelace");
    await user.click(screen.getByRole("button", { name: /revoke/i }));

    await waitFor(() => expect(mockApiDelete).toHaveBeenCalledWith("/admin/sessions/s1"));
  });
});
