import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrganizationsPage from "@/app/dashboard/organizations/page";
import { ORGS_PATH, organizationKeys } from "./organizations";

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockLegacyGet = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockLegacyGet(...args),
    post: vi.fn(),
  },
}));
vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn() }),
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
    mockLegacyGet.mockReset();
  });

  it("models organizations domain query keys and paths", () => {
    expect(organizationKeys.list()).toEqual(["organizations", "list"]);
    expect(ORGS_PATH).toBe("/orgs");
  });

  it("renders organizations through apiClient/TanStack Query, not legacy api.get", async () => {
    mockApiGet.mockResolvedValue({ orgs: [orgMembership] });
    renderWithQueryClient(<OrganizationsPage />);

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(ORGS_PATH);
    expect(mockLegacyGet).not.toHaveBeenCalled();
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
});
