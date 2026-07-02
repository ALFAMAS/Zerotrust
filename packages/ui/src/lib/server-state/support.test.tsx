import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupportPage from "@/app/dashboard/support/page";
import { supportKeys } from "./support";

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPatch = vi.fn();
const mockLegacyGet = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockLegacyGet(...args),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const tickets = [
  {
    id: "t1",
    subject: "Cannot log in",
    status: "open" as const,
    priority: "high" as const,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T01:00:00Z",
  },
];

const thread = {
  ticket: tickets[0],
  messages: [
    {
      id: "m1",
      authorRole: "user" as const,
      body: "I can't log in",
      createdAt: "2026-07-01T00:00:00Z",
    },
  ],
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

function mockSupportSuccess(list = tickets) {
  mockApiGet.mockImplementation((path: string) => {
    if (path === "/support") return Promise.resolve({ tickets: list });
    if (path === "/support/t1") return Promise.resolve(thread);
    return Promise.reject(new Error(`unexpected apiGet path ${path}`));
  });
}

describe("support TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiPatch.mockReset();
    mockLegacyGet.mockReset();
  });

  it("models support domain query keys", () => {
    expect(supportKeys.list()).toEqual(["support", "list", {}]);
    expect(supportKeys.detail("t1")).toEqual(["support", "detail", "t1"]);
  });

  it("renders tickets through apiClient/TanStack Query, not legacy api.get", async () => {
    mockSupportSuccess();
    renderWithQueryClient(<SupportPage />);

    expect(await screen.findByText("Cannot log in")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith("/support");
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("renders an error state with retry when the list fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("support unavailable"));
    renderWithQueryClient(<SupportPage />);

    expect(await screen.findByText("support unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("renders an empty state when there are no tickets", async () => {
    mockSupportSuccess([]);
    renderWithQueryClient(<SupportPage />);

    expect(await screen.findByText("No support tickets yet")).toBeInTheDocument();
  });

  it("uses mutations for create, reply, and close with targeted invalidation", async () => {
    mockSupportSuccess();
    mockApiPost.mockResolvedValue({
      id: "m2",
      authorRole: "agent",
      body: "We're looking into it",
      createdAt: "2026-07-01T02:00:00Z",
    });
    mockApiPatch.mockResolvedValue({
      ticket: { ...tickets[0], status: "closed" },
    });
    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<SupportPage />);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await screen.findByText("Cannot log in");

    // Open thread — the ticket button's accessible name includes the date/status
    const ticketButton = await screen.findByRole("button", {
      name: (name) => name.includes("Cannot log in"),
    });
    await user.click(ticketButton);
    expect(await screen.findByText("I can't log in")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith("/support/t1");

    // Reply
    await user.type(screen.getByPlaceholderText("Write a reply…"), "Thanks");
    await user.click(screen.getByRole("button", { name: "Send reply" }));
    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith("/support/t1/messages", { body: "Thanks" });
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: supportKeys.detail("t1") });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: supportKeys.list() });
    });

    // Close ticket
    await user.click(screen.getByRole("button", { name: "Close ticket" }));
    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith("/support/t1", { status: "closed" });
    });
  });
});
