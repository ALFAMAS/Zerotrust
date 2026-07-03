import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockToast = vi.fn();
vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { mockApiGet, mockApiPost } from "@/test/apiClientMock";
import OrganizationsClient from "./OrganizationsClient";

function renderOrganizations() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationsClient />
    </QueryClientProvider>
  );
}

describe("OrganizationsClient", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockToast.mockReset();
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/orgs/invites/mine") {
        return Promise.resolve({ data: [] });
      }
      if (path === "/orgs") {
        return Promise.resolve({
          orgs: [
            {
              org: { id: "org-1", name: "Acme Corp", slug: "acme-corp" },
              member: { role: "owner" },
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });
  });

  it("renders organization list", async () => {
    renderOrganizations();
    expect(await screen.findByText("Organizations")).toBeInTheDocument();
    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("acme-corp")).toBeInTheDocument();
  });

  it("shows pending invites with accept/decline actions", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/orgs/invites/mine") {
        return Promise.resolve({
          data: [
            {
              invite: {
                id: "inv-1",
                token: "tok-abc",
                role: "member",
                expiresAt: "2026-08-01T00:00:00Z",
              },
              org: { id: "org-2", name: "Beta LLC", slug: "beta" },
            },
          ],
        });
      }
      if (path === "/orgs") {
        return Promise.resolve({ orgs: [] });
      }
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });

    renderOrganizations();
    expect(await screen.findByText("Pending invitations")).toBeInTheDocument();
    expect(screen.getByText("Beta LLC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("creates an organization from the inline form", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/orgs/invites/mine") return Promise.resolve({ data: [] });
      if (path === "/orgs") return Promise.resolve({ orgs: [] });
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });
    mockApiPost.mockResolvedValue({
      org: { id: "org-new", name: "New Org", slug: "new-org" },
      member: { role: "owner" },
    });

    const user = userEvent.setup();
    renderOrganizations();

    await user.click(await screen.findByRole("button", { name: "Create your first organization" }));
    await user.type(screen.getByLabelText("Name"), "New Org");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mockApiPost).toHaveBeenCalledWith(
      "/orgs",
      expect.objectContaining({ name: "New Org", slug: "new-org" })
    );
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Organization created!", type: "success" })
    );
  });
});
