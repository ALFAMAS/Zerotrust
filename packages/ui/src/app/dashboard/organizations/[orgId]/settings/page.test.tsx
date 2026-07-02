import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiGet, mockApiPut } from "@/test/apiClientMock";
import OrgSettingsPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgId: "org-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function renderOrgSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrgSettingsPage />
    </QueryClientProvider>
  );
}

const mockOrgDetail = {
  org: { id: "org-1", name: "Acme Corp", slug: "acme", logoUrl: null, billingEmail: null },
  memberCount: 1,
};

const mockMembers = {
  data: [
    {
      member: { role: "owner" },
      user: { id: "u1", email: "owner@example.com", displayName: "Owner" },
    },
  ],
};

function mockOrgApis() {
  mockApiGet.mockImplementation((path: string) => {
    if (path === "/auth/me") return Promise.resolve({ id: "u1" });
    if (path === "/orgs/org-1") return Promise.resolve(mockOrgDetail);
    if (path === "/orgs/org-1/members") return Promise.resolve(mockMembers);
    if (path === "/orgs/org-1/security/policy") return Promise.resolve({ policy: null });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

describe("OrgSettingsPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPut.mockReset();
  });

  it("renders org settings form", async () => {
    mockOrgApis();
    renderOrgSettings();

    expect(await screen.findByText("Acme Corp — Settings")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Acme Corp")).toBeInTheDocument();
  });

  it("saves org name changes", async () => {
    mockOrgApis();
    mockApiPut.mockResolvedValue({ org: { ...mockOrgDetail.org, name: "Acme Inc" } });
    const user = userEvent.setup();
    renderOrgSettings();
    const nameInput = await screen.findByDisplayValue("Acme Corp");

    await user.clear(nameInput);
    await user.type(nameInput, "Acme Inc");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith(
        "/orgs/org-1",
        expect.objectContaining({ name: "Acme Inc" })
      );
    });
  });
});
