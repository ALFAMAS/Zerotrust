import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiPut } from "@/test/apiClientMock";
import RegionsPage from "./page";

function renderRegions() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegionsPage />
    </QueryClientProvider>
  );
}

describe("RegionsPage", () => {
  beforeEach(() => {
    mockApiPut.mockReset();
  });

  it("renders branding and domain sections", () => {
    renderRegions();

    expect(screen.getByText("Branding & Domains")).toBeInTheDocument();
    expect(screen.getByText("Org branding")).toBeInTheDocument();
    expect(screen.getByText("Custom domain")).toBeInTheDocument();
  });

  it("updates org branding via mutation", async () => {
    mockApiPut.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderRegions();

    await user.type(screen.getByLabelText("Organization ID", { selector: "#brandingOrgId" }), "org-1");
    await user.type(screen.getByLabelText("App name"), "Acme");
    await user.click(screen.getByRole("button", { name: "Save branding" }));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith("/regions/orgs/org-1/branding", {
        appName: "Acme",
        brandColor: "#6366f1",
      });
    });
  });
});
