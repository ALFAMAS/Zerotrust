import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AnomalyPage from "@/app/admin/anomaly/page";
import { anomalyKeys, buildAnomalyBaselinesPath } from "./anomaly";

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();
const mockLegacyGet = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockLegacyGet(...args),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const baseline = {
  id: "bl_1",
  userId: "user_abc",
  totalLogins: 12,
  knownIps: ["203.0.113.5"],
  knownCountries: ["US"],
  knownDevices: ["dev_1"],
  loginHourStats: { mean: 9, variance: 2, count: 12 },
  lastUpdatedAt: "2026-07-01T00:00:00Z",
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

function mockBaselinesSuccess(list = [baseline]) {
  mockApiGet.mockImplementation((path: string) => {
    if (path === buildAnomalyBaselinesPath({ limit: 100 })) {
      return Promise.resolve({ data: list });
    }
    return Promise.reject(new Error(`unexpected apiGet path ${path}`));
  });
}

describe("anomaly TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiDelete.mockReset();
    mockLegacyGet.mockReset();
  });

  it("models anomaly domain query keys and list paths", () => {
    expect(anomalyKeys.baselines({ limit: 100 })).toEqual(["anomaly", "baselines", { limit: 100 }]);
    expect(buildAnomalyBaselinesPath({ limit: 100 })).toBe(
      "/admin/anomaly/baselines?limit=100"
    );
  });

  it("renders baselines through apiClient/TanStack Query, not legacy api.get", async () => {
    mockBaselinesSuccess();
    renderWithQueryClient(<AnomalyPage />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("user_abc")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith("/admin/anomaly/baselines?limit=100");
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("renders error + retry when the baselines list fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("anomaly unavailable"));
    renderWithQueryClient(<AnomalyPage />);

    expect(await screen.findByText("anomaly unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("uses reset mutation with optimistic removal and invalidates baselines", async () => {
    mockBaselinesSuccess();
    mockApiDelete.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<AnomalyPage />);
    await screen.findByText("user_abc");

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(mockApiDelete).toHaveBeenCalledWith("/admin/anomaly/baseline/user_abc")
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: anomalyKeys.baselines() });
  });
});
