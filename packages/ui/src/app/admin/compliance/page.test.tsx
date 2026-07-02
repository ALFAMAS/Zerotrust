import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import CompliancePage from "./page";

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

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

function renderCompliance() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CompliancePage />
    </QueryClientProvider>
  );
}

describe("CompliancePage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

const currentYear = new Date().getFullYear();

const riskAssessment = {
  year: currentYear,
  totalRisks: 0,
  openRisks: 0,
  mitigatedRisks: 0,
  closedRisks: 0,
  avgRiskScore: 0,
  risks: [],
};

  it("renders SOC 2 readiness and controls", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/compliance/soc2/readiness") return Promise.resolve(readiness);
      if (path === "/compliance/soc2/controls") return Promise.resolve({ data: controls });
      if (path === `/compliance/risk-assessment/${currentYear}`) return Promise.resolve(riskAssessment);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    renderCompliance();

    expect(await screen.findByText("Compliance")).toBeInTheDocument();
    expect(await screen.findByText("75%")).toBeInTheDocument();
    expect(screen.getByText("Logical access controls")).toBeInTheDocument();
  });

  it("shows error when compliance data fails to load", async () => {
    mockApiGet.mockRejectedValue(new Error("compliance unavailable"));
    renderCompliance();

    expect(await screen.findByText("compliance unavailable")).toBeInTheDocument();
  });
});
