import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgId: "org-1" }),
  useRouter: () => ({ push: mockPush }),
}));

const mockPush = vi.fn();
const mockToast = vi.fn();
vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();
vi.mock("../../../../lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import OrgDetailPage from "./page";

const org = {
  id: "org-1",
  name: "Acme Inc",
  slug: "acme-inc",
  logoUrl: null,
  billingEmail: null,
  ownerId: "user-1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const me = { id: "user-1", email: "me@example.com", displayName: "Me" };

function membersResponse(role: string) {
  return {
    data: [
      {
        member: {
          id: "mem-1",
          orgId: "org-1",
          userId: "user-1",
          role,
          joinedAt: "2026-01-01T00:00:00Z",
          createdAt: "2026-01-01T00:00:00Z",
        },
        user: { id: "user-1", email: "me@example.com", displayName: "Me", avatarUrl: null },
      },
      {
        member: {
          id: "mem-2",
          orgId: "org-1",
          userId: "user-2",
          role: "member",
          joinedAt: "2026-01-02T00:00:00Z",
          createdAt: "2026-01-02T00:00:00Z",
        },
        user: { id: "user-2", email: "other@example.com", displayName: "Other User", avatarUrl: null },
      },
    ],
    pagination: {},
  };
}

describe("OrgDetailPage", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockDelete.mockReset();
    mockToast.mockReset();
    mockPush.mockReset();
    window.confirm = vi.fn(() => true);
  });

  function mockAsAdmin() {
    mockGet.mockImplementation((path: string) => {
      if (path === "/orgs/org-1") return Promise.resolve({ org, memberCount: 2 });
      if (path === "/auth/me") return Promise.resolve(me);
      if (path === "/orgs/org-1/members") return Promise.resolve(membersResponse("owner"));
      if (path === "/orgs/org-1/invites") return Promise.resolve({ data: [], pagination: {} });
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
  }

  function mockAsMember() {
    mockGet.mockImplementation((path: string) => {
      if (path === "/orgs/org-1") return Promise.resolve({ org, memberCount: 2 });
      if (path === "/auth/me") return Promise.resolve(me);
      if (path === "/orgs/org-1/members") return Promise.resolve(membersResponse("member"));
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
  }

  it("renders the member list once loaded", async () => {
    mockAsAdmin();
    render(<OrgDetailPage />);

    expect(await screen.findByText("Acme Inc")).toBeInTheDocument();
    expect(screen.getByText("Other User")).toBeInTheDocument();
    expect(screen.getByText("2 members")).toBeInTheDocument();
  });

  it("shows the invite form and pending invites for an admin/owner", async () => {
    mockAsAdmin();
    render(<OrgDetailPage />);

    expect(await screen.findByText("Invite member")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("colleague@example.com")).toBeInTheDocument();
  });

  it("hides the invite form for a non-admin member", async () => {
    mockAsMember();
    render(<OrgDetailPage />);

    await screen.findByText("Acme Inc");
    expect(screen.queryByText("Invite member")).not.toBeInTheDocument();
  });

  it("sends an invite with the default role", async () => {
    mockAsAdmin();
    mockPost.mockResolvedValue({});
    const user = userEvent.setup();

    render(<OrgDetailPage />);
    await screen.findByText("Invite member");

    await user.type(screen.getByPlaceholderText("colleague@example.com"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/orgs/org-1/invites", {
        email: "new@example.com",
        role: "member",
      });
    });
    expect(mockToast).toHaveBeenCalledWith({ message: "Invite sent!", type: "success" });
  });

  it("leaves the organization after confirming", async () => {
    mockAsMember();
    mockDelete.mockResolvedValue({});
    const user = userEvent.setup();

    render(<OrgDetailPage />);
    await screen.findByText("Acme Inc");

    await user.click(screen.getByRole("button", { name: "Leave" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/orgs/org-1/members/user-1");
    });
    expect(mockPush).toHaveBeenCalledWith("/dashboard/organizations");
  });

  it("does not show a Leave button for the owner", async () => {
    mockAsAdmin();
    render(<OrgDetailPage />);

    await screen.findByText("Acme Inc");
    expect(screen.queryByRole("button", { name: "Leave" })).not.toBeInTheDocument();
  });
});
