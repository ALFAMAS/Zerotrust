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
        expect.objectContaining({ name: "Acme Inc", billingEmail: null, logoUrl: null })
      );
    });
  });

  it("shows an associated billing email error and focuses the invalid field", async () => {
    mockOrgApis();
    const user = userEvent.setup();
    renderOrgSettings();

    const billingEmail = await screen.findByLabelText("Billing email");
    await user.type(billingEmail, "not-an-email");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Enter a valid billing email")).toBeInTheDocument();
    expect(billingEmail).toHaveFocus();
    expect(billingEmail).toHaveAttribute("aria-describedby", "org-billing-email-error");
    expect(mockApiPut).not.toHaveBeenCalled();
  });

  it("normalizes security policy list fields before saving", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.resolve({ id: "u1" });
      if (path === "/orgs/org-1") return Promise.resolve(mockOrgDetail);
      if (path === "/orgs/org-1/members") return Promise.resolve(mockMembers);
      if (path === "/orgs/org-1/security/policy") {
        return Promise.resolve({
          policy: {
            requirePasskeyAttestation: false,
            requireHardwarePasskey: false,
            allowedPasskeyAaguids: [],
            deniedPasskeyAaguids: [],
            ipAllowlist: [],
            maxSessionAgeSeconds: 0,
            idleTimeoutSeconds: 0,
            maxConcurrentSessions: 0,
            allowedCountries: [],
          },
        });
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    mockApiPut.mockResolvedValue({
      policy: {
        requirePasskeyAttestation: false,
        requireHardwarePasskey: false,
        allowedPasskeyAaguids: [],
        deniedPasskeyAaguids: [],
        ipAllowlist: ["203.0.113.0/24"],
        maxSessionAgeSeconds: 0,
        idleTimeoutSeconds: 0,
        maxConcurrentSessions: 0,
        allowedCountries: ["AU", "US"],
      },
    });
    const user = userEvent.setup();
    renderOrgSettings();

    await user.type(await screen.findByLabelText(/IP allowlist/), "203.0.113.0/24");
    await user.type(screen.getByLabelText(/Allowed countries/), "au us");
    await user.click(screen.getByRole("button", { name: "Save security policy" }));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith(
        "/orgs/org-1/security/policy",
        expect.objectContaining({
          ipAllowlist: ["203.0.113.0/24"],
          allowedCountries: ["AU", "US"],
        })
      );
    });
  });
});
