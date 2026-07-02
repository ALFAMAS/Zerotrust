import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CompliancePage from "@/app/admin/compliance/page";
import {
  SOC2_CONTROLS_PATH,
  SOC2_READINESS_PATH,
  buildRiskAssessmentPath,
  complianceKeys,
  nextControlStatus,
} from "./compliance";

const mockApiGet = vi.fn();
const mockApiPut = vi.fn();
const mockLegacyGet = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockLegacyGet(...args),
    put: vi.fn(),
  },
}));
vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const currentYear = new Date().getFullYear();

const readiness = {
  total: 2,
  implemented: 1,
  partial: 1,
  planned: 0,
  readinessPercent: 75,
};

const controls = [
  {
    controlId: "CC6.1",
    category: "CC6",
    title: "Logical access controls",
    implementation: "MFA and RBAC",
    evidence: "src/middleware/auth.ts",
    status: "implemented" as const,
  },
];

const riskAssessment = {
  year: currentYear,
  totalRisks: 1,
  openRisks: 1,
  mitigatedRisks: 0,
  closedRisks: 0,
  avgRiskScore: 9,
  risks: [
    {
      year: currentYear,
      riskId: "R-001",
      category: "security",
      title: "Credential stuffing",
      description: "Automated login attempts",
      likelihood: 3,
      impact: 3,
      riskScore: 9,
      treatment: "mitigate" as const,
      mitigation: "Rate limiting and MFA",
      owner: "security",
      status: "open" as const,
    },
  ],
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

function mockComplianceSuccess() {
  mockApiGet.mockImplementation((path: string) => {
    if (path === SOC2_READINESS_PATH) return Promise.resolve(readiness);
    if (path === SOC2_CONTROLS_PATH) return Promise.resolve({ data: controls });
    if (path === buildRiskAssessmentPath(currentYear)) return Promise.resolve(riskAssessment);
    return Promise.reject(new Error(`unexpected apiGet path ${path}`));
  });
}

describe("compliance TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPut.mockReset();
    mockLegacyGet.mockReset();
  });

  it("models compliance domain query keys and helpers", () => {
    expect(complianceKeys.soc2Readiness()).toEqual(["compliance", "soc2Readiness"]);
    expect(complianceKeys.soc2Controls()).toEqual(["compliance", "soc2Controls"]);
    expect(complianceKeys.riskAssessment(2026)).toEqual(["compliance", "riskAssessment", 2026]);
    expect(buildRiskAssessmentPath(2026)).toBe("/compliance/risk-assessment/2026");
    expect(nextControlStatus("implemented")).toBe("partial");
    expect(nextControlStatus("partial")).toBe("planned");
    expect(nextControlStatus("planned")).toBe("implemented");
  });

  it("renders compliance data through apiClient/TanStack Query, not legacy api.get", async () => {
    mockComplianceSuccess();
    renderWithQueryClient(<CompliancePage />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("75%")).toBeInTheDocument();
    expect(screen.getByText("Logical access controls")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(SOC2_READINESS_PATH);
    expect(mockApiGet).toHaveBeenCalledWith(SOC2_CONTROLS_PATH);
    expect(mockApiGet).toHaveBeenCalledWith(buildRiskAssessmentPath(currentYear));
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("renders error + retry when SOC2 data fails", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === SOC2_READINESS_PATH) return Promise.reject(new Error("compliance unavailable"));
      if (path === SOC2_CONTROLS_PATH) return Promise.resolve({ data: [] });
      if (path === buildRiskAssessmentPath(currentYear)) return Promise.resolve(riskAssessment);
      return Promise.reject(new Error(`unexpected apiGet path ${path}`));
    });

    renderWithQueryClient(<CompliancePage />);

    expect(await screen.findByText("compliance unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("cycles control status via mutation and invalidates readiness", async () => {
    mockComplianceSuccess();
    mockApiPut.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<CompliancePage />);
    await screen.findByText("Logical access controls");

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(screen.getByRole("button", { name: "implemented" }));
    await waitFor(() =>
      expect(mockApiPut).toHaveBeenCalledWith("/compliance/soc2/controls/CC6.1", {
        status: "partial",
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: complianceKeys.soc2Readiness(),
    });
  });
});
