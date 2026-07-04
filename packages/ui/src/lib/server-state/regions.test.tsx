import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import RegionsPage from "@/app/admin/regions/page";
import { buildOrgBrandingPath, buildOrgDomainPath, regionKeys } from "./regions";

import { mockApiPut } from "@/test/apiClientMock";

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

describe("regions TanStack Query server state", () => {
  beforeEach(() => {
    mockApiPut.mockReset();
  });

  it("models regions domain query keys and paths", () => {
    expect(regionKeys.branding("org_1")).toEqual(["regions", "branding", "org_1"]);
    expect(buildOrgBrandingPath("org_1")).toBe("/regions/orgs/org_1/branding");
    expect(buildOrgDomainPath("org_1")).toBe("/regions/orgs/org_1/domain");
  });

  it("updates org branding through apiClient/TanStack Query", async () => {
    mockApiPut.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    renderWithQueryClient(<RegionsPage />);

    await user.type(screen.getByLabelText("Organization ID", { selector: "#brandingOrgId" }), "org_1");
    await user.click(screen.getByRole("button", { name: "Save branding" }));

    await waitFor(() =>
      expect(mockApiPut).toHaveBeenCalledWith(buildOrgBrandingPath("org_1"), {
        brandColor: "#6366f1",
      })
    );
  });
});
