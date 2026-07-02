import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiDelete, mockApiGet } from "@/test/apiClientMock";

import SessionsPage from "./page";

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
      <SessionsPage />
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
