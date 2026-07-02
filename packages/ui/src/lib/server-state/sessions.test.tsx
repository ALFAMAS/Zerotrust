import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionsPage from "@/app/admin/sessions/page";
import {
  buildAdminSessionRevokePath,
  buildAdminSessionsListPath,
  sessionKeys,
} from "./sessions";

const mockApiGet = vi.fn();
const mockApiDelete = vi.fn();
const mockLegacyGet = vi.fn();
const mockLegacyDelete = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));

const session = {
  id: "sess_1",
  userId: "user_1",
  userEmail: "user@example.com",
  isActive: true,
  createdAt: "2026-07-01T00:00:00Z",
  expiresAt: "2026-08-01T00:00:00Z",
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

describe("sessions TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiDelete.mockReset();
    mockLegacyGet.mockReset();
    mockLegacyDelete.mockReset();
  });

  it("models sessions domain query keys and paths", () => {
    expect(sessionKeys.list({ page: 1, limit: 20 })).toEqual([
      "admin",
      "sessions",
      "list",
      { page: 1, limit: 20 },
    ]);
    expect(buildAdminSessionsListPath({ page: 1, limit: 20 })).toBe(
      "/admin/sessions?page=1&limit=20"
    );
    expect(buildAdminSessionRevokePath("sess_1")).toBe("/admin/sessions/sess_1");
  });

  it("renders paginated sessions through apiClient/TanStack Query, not legacy api", async () => {
    mockApiGet.mockResolvedValue({
      data: [session],
      pagination: { total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    });

    renderWithQueryClient(<SessionsPage />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith("/admin/sessions?page=1&limit=20");
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("renders error + retry when the sessions list fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("sessions unavailable"));
    renderWithQueryClient(<SessionsPage />);

    expect(await screen.findByText("sessions unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("revokes a session via mutation and invalidates the list", async () => {
    mockApiGet.mockResolvedValue({
      data: [session],
      pagination: { total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    });
    mockApiDelete.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<SessionsPage />);
    await screen.findByText("user@example.com");

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() =>
      expect(mockApiDelete).toHaveBeenCalledWith("/admin/sessions/sess_1")
    );
    expect(mockLegacyDelete).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sessionKeys.list() });
  });
});
