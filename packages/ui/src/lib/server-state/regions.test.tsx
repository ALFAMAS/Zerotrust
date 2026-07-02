import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RegionsPage from "@/app/admin/regions/page";
import { REGION_HEALTH_PATH, buildOrgRegionPath, regionKeys } from "./regions";

const mockApiGet = vi.fn();
const mockApiPut = vi.fn();
const mockLegacyGet = vi.fn();
const mockLegacyPut = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockLegacyGet(...args),
    put: (...args: unknown[]) => mockLegacyPut(...args),
  },
}));

const health = { status: "ok", regions: ["us", "eu", "apac"] };

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
    mockApiGet.mockReset();
    mockApiPut.mockReset();
    mockLegacyGet.mockReset();
    mockLegacyPut.mockReset();
  });

  it("models regions domain query keys and paths", () => {
    expect(regionKeys.health()).toEqual(["regions", "health"]);
    expect(REGION_HEALTH_PATH).toBe("/regions/health");
    expect(buildOrgRegionPath("org_1")).toBe("/regions/orgs/org_1/region");
  });

  it("renders region health through apiClient/TanStack Query, not legacy api", async () => {
    mockApiGet.mockResolvedValue(health);

    renderWithQueryClient(<RegionsPage />);

    expect(await screen.findByText("ok")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(REGION_HEALTH_PATH);
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("renders error + retry when region health fetch fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("regions unavailable"));
    renderWithQueryClient(<RegionsPage />);

    expect(await screen.findByText("regions unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("pins an org to a region via mutation", async () => {
    mockApiGet.mockResolvedValue(health);
    mockApiPut.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    renderWithQueryClient(<RegionsPage />);
    await screen.findByText("ok");

    await user.type(screen.getByLabelText("Organization ID"), "org_1");
    await user.click(screen.getByRole("button", { name: "Set region" }));

    await waitFor(() =>
      expect(mockApiPut).toHaveBeenCalledWith(buildOrgRegionPath("org_1"), { region: "us" })
    );
    expect(mockLegacyPut).not.toHaveBeenCalled();
  });
});
