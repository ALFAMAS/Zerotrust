import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import UsersPage from "./page";

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
  mockGet.mockResolvedValue({ data: list, pagination: { total } });
}

describe("Admin UsersPage", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPatch.mockReset();
    mockDelete.mockReset();
    window.confirm = vi.fn(() => true);
  });

  it("renders the user table once loaded", async () => {
    mockUsersResponse(users);
    render(<UsersPage />);

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("2 total users")).toBeInTheDocument();
  });

  it("shows an empty state when there are no users", async () => {
    mockUsersResponse([], 0);
    render(<UsersPage />);

    expect(await screen.findByText("No users found.")).toBeInTheDocument();
  });

  it("shows a toast when loading fails", async () => {
    mockGet.mockRejectedValue(new Error("network error"));
    render(<UsersPage />);

    expect(await screen.findByText("Failed to load users")).toBeInTheDocument();
  });

  it("re-fetches with the search query when typing in the search box", async () => {
    mockUsersResponse(users);
    const user = userEvent.setup();
    render(<UsersPage />);
    await screen.findByText("Ada Lovelace");

    mockGet.mockClear();
    mockUsersResponse(users);
    await user.type(screen.getByPlaceholderText("Search by email or name…"), "ada");

    await waitFor(() => {
      const calledWithSearch = mockGet.mock.calls.some((c) => String(c[0]).includes("search=ada"));
      expect(calledWithSearch).toBe(true);
    });
  });

  it("toggles a user's status between active and suspended", async () => {
    mockUsersResponse(users);
    mockPatch.mockResolvedValue({});
    const user = userEvent.setup();
    render(<UsersPage />);
    await screen.findByText("Ada Lovelace");

    const row = screen.getByText("Ada Lovelace").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Suspend" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/admin/users/u1", { status: "suspended" });
    });
    expect(await screen.findByText("User suspended")).toBeInTheDocument();
  });

  it("deletes a user after confirming", async () => {
    mockUsersResponse(users);
    mockDelete.mockResolvedValue({});
    const user = userEvent.setup();
    render(<UsersPage />);
    await screen.findByText("Ada Lovelace");

    const row = screen.getByText("Ada Lovelace").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/admin/users/u1");
    });
    expect(await screen.findByText("User deleted")).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });

  it("disables Previous on the first page", async () => {
    mockUsersResponse(users, 2);
    render(<UsersPage />);
    await screen.findByText("Ada Lovelace");

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });
});
