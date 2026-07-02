import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrganizationsPage from "@/app/dashboard/organizations/page";
import OrgSettingsPage from "@/app/dashboard/organizations/[orgId]/settings/page";
import { mockApiDelete, mockApiGet, mockApiPost, mockApiPut } from "@/test/apiClientMock";
import {
  ORGS_PATH,
  buildOrgInvitePath,
  buildOrgPath,
  buildOrgSecurityPolicyPath,
  organizationKeys,
  useRevokeOrgInviteMutation,
  useSaveOrgSecurityPolicyMutation,
} from "./organizations";
vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgId: "org_1" }),
  useRouter: () => ({ push: vi.fn() }),
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

function hookWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    Wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe("organizations TanStack Query server state", () => {
  
  it("models organizations domain query keys and paths", () => {
    expect(organizationKeys.list()).toEqual(["organizations", "list"]);
    expect(ORGS_PATH).toBe("/orgs");
  });

  it("renders organizations through apiClient/TanStack Query, not legacy api.get", async () => {
    mockApiGet.mockResolvedValue({ orgs: [orgMembership] });
    renderWithQueryClient(<OrganizationsPage />);

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(ORGS_PATH);
  });

  it("renders error + retry when organizations list fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("orgs unavailable"));
    renderWithQueryClient(<OrganizationsPage />);

    expect(await screen.findByText("orgs unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("creates organization via mutation and invalidates the list", async () => {
    mockApiGet.mockResolvedValue({ orgs: [] });
    mockApiPost.mockResolvedValue({ id: "org_2" });

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<OrganizationsPage />);
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

  it("loads org settings for owners and saves organization details", async () => {
    const owner = { id: "user_1", email: "owner@example.com", displayName: "Owner" };
    const policy = {
      requirePasskeyAttestation: false,
      requireHardwarePasskey: false,
      allowedPasskeyAaguids: [],
      deniedPasskeyAaguids: [],
      ipAllowlist: [],
      maxSessionAgeSeconds: 0,
      idleTimeoutSeconds: 0,
      maxConcurrentSessions: 0,
      allowedCountries: [],
    };

    mockApiGet.mockImplementation((path: string) => {
      if (path === buildOrgPath("org_1")) {
        return Promise.resolve({
          org: orgMembership.org,
          memberCount: 1,
        });
      }
      if (path === "/auth/me") return Promise.resolve(owner);
      if (path === `${buildOrgPath("org_1")}/members`) {
        return Promise.resolve({
          data: [
            {
              member: { ...orgMembership.member, role: "owner" },
              user: { id: "user_1", email: "owner@example.com", displayName: "Owner", avatarUrl: null },
            },
          ],
          pagination: {},
        });
      }
      if (path === buildOrgSecurityPolicyPath("org_1")) {
        return Promise.resolve({ policy });
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
    mockApiPut.mockResolvedValue({
      org: { ...orgMembership.org, name: "Acme Updated" },
    });

    const user = userEvent.setup();
    renderWithQueryClient(<OrgSettingsPage />);

    const nameInput = await screen.findByLabelText("Organization name");
    expect(nameInput).toHaveValue("Acme Corp");

    await user.clear(nameInput);
    await user.type(nameInput, "Acme Updated");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mockApiPut).toHaveBeenCalledWith(buildOrgPath("org_1"), {
        name: "Acme Updated",
        billingEmail: undefined,
        logoUrl: undefined,
      })
    );
  });

  it("denies org settings for non-admin members", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === buildOrgPath("org_1")) {
        return Promise.resolve({ org: orgMembership.org, memberCount: 2 });
      }
      if (path === "/auth/me") {
        return Promise.resolve({ id: "user_2", email: "member@example.com" });
      }
      if (path === `${buildOrgPath("org_1")}/members`) {
        return Promise.resolve({
          data: [
            {
              member: { ...orgMembership.member, userId: "user_2", role: "member" },
              user: { id: "user_2", email: "member@example.com", displayName: "Member", avatarUrl: null },
            },
          ],
          pagination: {},
        });
      }
      if (path === buildOrgSecurityPolicyPath("org_1")) {
        return Promise.resolve({ policy: {} });
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    renderWithQueryClient(<OrgSettingsPage />);

    expect(await screen.findByText("Access denied")).toBeInTheDocument();
  });

  it("renders org settings error + retry when detail load fails", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === buildOrgPath("org_1")) return Promise.reject(new Error("settings unavailable"));
      if (path === "/auth/me") return Promise.resolve({ id: "user_1" });
      if (path === `${buildOrgPath("org_1")}/members`) return Promise.resolve({ data: [], pagination: {} });
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    renderWithQueryClient(<OrgSettingsPage />);

    expect(await screen.findByText("settings unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("revokes an org invite via mutation", async () => {
    mockApiDelete.mockResolvedValue({ success: true });
    const { Wrapper, queryClient } = hookWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useRevokeOrgInviteMutation("org_1"), { wrapper: Wrapper });

    await result.current.mutateAsync("invite_1");

    expect(mockApiDelete).toHaveBeenCalledWith(buildOrgInvitePath("org_1", "invite_1"));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: organizationKeys.invites("org_1"),
      })
    );
  });

  it("saves org security policy via mutation", async () => {
    const policy = {
      requirePasskeyAttestation: true,
      requireHardwarePasskey: false,
      allowedPasskeyAaguids: [],
      deniedPasskeyAaguids: [],
      ipAllowlist: ["203.0.113.0/24"],
      maxSessionAgeSeconds: 3600,
      idleTimeoutSeconds: 900,
      maxConcurrentSessions: 3,
      allowedCountries: ["US"],
    };
    mockApiPut.mockResolvedValue({ policy });
    const { Wrapper, queryClient } = hookWrapper();
    const policyKey = organizationKeys.securityPolicy("org_1");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveOrgSecurityPolicyMutation("org_1"), {
      wrapper: Wrapper,
    });

    await result.current.mutateAsync(policy);

    expect(mockApiPut).toHaveBeenCalledWith(buildOrgSecurityPolicyPath("org_1"), policy);
    expect(queryClient.getQueryData(policyKey)).toEqual({ policy });
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: policyKey }));
  });
});
