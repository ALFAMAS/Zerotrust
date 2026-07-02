import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

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
  mockGet.mockResolvedValue({
    data: sessions,
    pagination: {
      page,
      limit: 20,
      total: totalPages * 20,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
}

describe("Admin SessionsPage", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDelete.mockReset();
  });

  it("requests sessions with page and limit, then advances to the next page", async () => {
    mockSessionsResponse(1, 2);
    const user = userEvent.setup();

    render(<SessionsPage />);

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/admin/sessions?page=1&limit=20");
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    mockGet.mockClear();
    mockSessionsResponse(2, 2);
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("/admin/sessions?page=2&limit=20");
    });
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });
});
