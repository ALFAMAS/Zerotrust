import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet, mockApiPut } from "@/test/apiClientMock";
import RegionsPage from "./page";

const health = { status: "ok", regions: ["us", "eu", "apac"] };

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
    mockApiGet.mockReset();
    mockApiPut.mockReset();
  });

  it("renders region health status", async () => {
    mockApiGet.mockResolvedValue(health);
    renderRegions();

    expect(await screen.findByText("ok")).toBeInTheDocument();
    expect(screen.getByText("Region health")).toBeInTheDocument();
  });

  it("sets org region via mutation", async () => {
    mockApiGet.mockResolvedValue(health);
    mockApiPut.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderRegions();
    await screen.findByText("ok");

    await user.type(screen.getByLabelText("Organization ID", { selector: "#orgId" }), "org-1");
    await user.click(screen.getByRole("button", { name: "Set region" }));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith("/regions/orgs/org-1/region", { region: "us" });
    });
  });

  it("shows error when health check fails", async () => {
    mockApiGet.mockRejectedValue(new Error("regions down"));
    renderRegions();

    expect(await screen.findByText("regions down")).toBeInTheDocument();
  });
});
