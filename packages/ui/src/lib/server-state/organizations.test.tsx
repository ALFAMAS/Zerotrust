import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrganizationsClient from "@/app/dashboard/organizations/OrganizationsClient";
import { mockApiDelete, mockApiGet, mockApiPost } from "@/test/apiClientMock";
import {
  buildDeclineOrgInvitePath,
  ORG_INVITES_ACCEPT_PATH,
  ORG_INVITES_MINE_PATH,
  ORGS_PATH,
  organizationKeys,
} from "./organizations";

const mockToast = vi.fn();
vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const orgMembership = {
  member: {
    id: "mem_1",
    orgId: "org_1",
    userId: "user_1",
    role: "owner",
    joinedAt: "2026-07-01T00:00:00Z",
    createdAt: "2026-07-01T00:00:00Z",
  },
  org: {
    id: "org_1",
    name: "Acme Corp",
    slug: "acme-corp",
    logoUrl: null,
    billingEmail: null,
    ownerId: "user_1",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  },
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

describe("organizations TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiDelete.mockReset();
    mockToast.mockReset();
    mockApiGet.mockImplementation((path: string) => {
      if (path === ORGS_PATH) return Promise.resolve({ orgs: [] });
      if (path === ORG_INVITES_MINE_PATH) return Promise.resolve({ data: [], pagination: {} });
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
  });

  it("models organizations domain query keys and paths", () => {
    expect(organizationKeys.list()).toEqual(["organizations", "list"]);
    expect(ORGS_PATH).toBe("/orgs");
  });

  it("renders organizations through apiClient/TanStack Query, not legacy api.get", async () => {
    mockApiGet.mockResolvedValue({ orgs: [orgMembership] });
    renderWithQueryClient(<OrganizationsClient />);

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(ORGS_PATH);
  });

  it("renders error + retry when organizations list fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("orgs unavailable"));
    renderWithQueryClient(<OrganizationsClient />);

    expect(await screen.findByText("orgs unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("creates organization via mutation and invalidates the list", async () => {
    mockApiGet.mockResolvedValue({ orgs: [] });
    mockApiPost.mockResolvedValue({
      org: { id: "org_2", name: "New Org", slug: "new-org" },
      member: { role: "owner" },
    });

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<OrganizationsClient />);
    await screen.findByText(/don't belong to any organizations/i);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: /Create your first organization/i }));
    await user.type(screen.getByLabelText("Name"), "New Org");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith(ORGS_PATH, {
        name: "New Org",
        slug: "new-org",
      })
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: organizationKeys.list() })
    );
  });
});

describe("organizations page — pending invitations", () => {
  const myInvite = {
    invite: {
      id: "invite_1",
      orgId: "org_2",
      email: "me@example.com",
      role: "member",
      token: "tok_abc123",
      expiresAt: "2026-08-01T00:00:00Z",
      createdAt: "2026-07-01T00:00:00Z",
    },
    org: { id: "org_2", name: "Globex Corp", slug: "globex" },
  };

  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiDelete.mockReset();
    mockToast.mockReset();
  });

  function mockWithInvite() {
    mockApiGet.mockImplementation((path: string) => {
      if (path === ORGS_PATH) return Promise.resolve({ orgs: [] });
      if (path === ORG_INVITES_MINE_PATH) {
        return Promise.resolve({ data: [myInvite], pagination: {} });
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
  }

  it("shows pending invitations with the org name and role", async () => {
    mockWithInvite();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <OrganizationsClient />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Pending invitations")).toBeInTheDocument();
    expect(screen.getByText("Globex Corp")).toBeInTheDocument();
    expect(screen.getByText("member")).toBeInTheDocument();
  });

  it("accepts an invitation via the accept endpoint", async () => {
    mockWithInvite();
    mockApiPost.mockResolvedValue({ org: { id: "org_2", name: "Globex Corp" }, member: { role: "member" } });
    const user = userEvent.setup();

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <OrganizationsClient />
      </QueryClientProvider>
    );

    await screen.findByText("Pending invitations");
    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(ORG_INVITES_ACCEPT_PATH, { token: "tok_abc123" });
    });
    expect(mockToast).toHaveBeenCalledWith({
      message: "You've joined Globex Corp!",
      type: "success",
    });
  });

  it("declines an invitation via the decline endpoint", async () => {
    mockWithInvite();
    mockApiDelete.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <OrganizationsClient />
      </QueryClientProvider>
    );

    await screen.findByText("Pending invitations");
    await user.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith(buildDeclineOrgInvitePath("invite_1"));
    });
    expect(mockToast).toHaveBeenCalledWith({ message: "Invitation declined", type: "success" });
  });

  it("does not show the pending invitations section when there are none", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === ORGS_PATH) return Promise.resolve({ orgs: [] });
      if (path === ORG_INVITES_MINE_PATH) return Promise.resolve({ data: [], pagination: {} });
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <OrganizationsClient />
      </QueryClientProvider>
    );

    await screen.findByText(/don't belong to any organizations/i);
    expect(screen.queryByText("Pending invitations")).not.toBeInTheDocument();
  });
});
