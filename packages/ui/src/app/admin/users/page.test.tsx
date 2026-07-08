import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiDelete, mockApiGet, mockApiPatch } from "@/test/apiClientMock";

const mockToast = vi.fn();
vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ toast: mockToast }),
}));

import UsersClient from "./UsersClient";

const users = [
  {
    id: "u1",
    displayName: "Ada Lovelace",
    email: "ada@example.com",
    status: "active",
    roles: ["user"],
    emailVerifiedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    lastLoginAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "u2",
    displayName: "Grace Hopper",
    email: "grace@example.com",
    status: "suspended",
    roles: ["admin"],
    emailVerifiedAt: null,
    createdAt: "2026-02-01T00:00:00Z",
    lastLoginAt: undefined,
  },
];

function mockUsersResponse(list: typeof users, total = list.length) {
  mockApiGet.mockResolvedValue({ data: list, pagination: { total } });
}

function renderUsers() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersClient />
    </QueryClientProvider>
  );
}

describe("Admin UsersPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPatch.mockReset();
    mockApiDelete.mockReset();
    mockToast.mockReset();
    window.confirm = vi.fn(() => true);
  });

  it("renders the user table once loaded", async () => {
    mockUsersResponse(users);
    renderUsers();

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("2 total users")).toBeInTheDocument();
  });

  it("shows an empty state when there are no users", async () => {
    mockUsersResponse([], 0);
    renderUsers();

    expect(await screen.findByText("No users found.")).toBeInTheDocument();
  });

  it("shows a toast when loading fails", async () => {
    mockApiGet.mockRejectedValue(new Error("network error"));
    renderUsers();

    expect(await screen.findByText("network error")).toBeInTheDocument();
  });

  it("re-fetches with the search query when typing in the search box", async () => {
    mockUsersResponse(users);
    const user = userEvent.setup();
    renderUsers();
    await screen.findByText("Ada Lovelace");

    mockApiGet.mockClear();
    mockUsersResponse(users);
    await user.type(screen.getByPlaceholderText("Search by email or name…"), "ada");

    await waitFor(() => {
      const calledWithSearch = mockApiGet.mock.calls.some((c) => String(c[0]).includes("search=ada"));
      expect(calledWithSearch).toBe(true);
    });
  });

  it("toggles a user's status between active and suspended", async () => {
    mockUsersResponse(users);
    mockApiPatch.mockResolvedValue({});
    const user = userEvent.setup();
    renderUsers();
    await screen.findByText("Ada Lovelace");

    const row = screen.getByText("Ada Lovelace").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Suspend" }));

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith("/admin/users/u1", { status: "suspended" });
    });
    expect(mockToast).toHaveBeenCalledWith({ message: "User suspended", type: "success" });
  });

  it("deletes a user after confirming", async () => {
    mockUsersResponse(users);
    mockApiDelete.mockResolvedValue({});
    const user = userEvent.setup();
    renderUsers();
    await screen.findByText("Ada Lovelace");

    const row = screen.getByText("Ada Lovelace").closest("tr")!;
    mockUsersResponse(users.filter((u) => u.id !== "u1"));
    await user.click(within(row).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith("/admin/users/u1");
    });
    expect(mockToast).toHaveBeenCalledWith({ message: "User deleted", type: "success" });
    await waitFor(() => {
      expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    });
  });

  it("disables Previous on the first page", async () => {
    mockUsersResponse(users, 2);
    renderUsers();
    await screen.findByText("Ada Lovelace");

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });
});
