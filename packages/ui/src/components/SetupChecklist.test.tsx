import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ONBOARDING_COMPLETE_PATH } from "@/lib/server-state/auth";
import { mockApiPost } from "@/test/apiClientMock";
import SetupChecklist from "./SetupChecklist";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const incompleteUser = {
  email: "user@example.com",
  displayName: "user@example.com",
  emailVerified: false,
  onboarding: {
    hasOrg: false,
    hasSentInvite: false,
    hasMfa: false,
    hasApiKey: false,
  },
  mfa: { totp: { enabled: false } },
};

const completeUser = {
  email: "user@example.com",
  displayName: "Complete User",
  emailVerified: true,
  onboarding: {
    hasOrg: true,
    hasSentInvite: true,
    hasMfa: true,
    hasApiKey: true,
  },
  mfa: { totp: { enabled: true } },
};

describe("SetupChecklist", () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiPost.mockReset().mockResolvedValue(undefined);
  });

  it("renders nothing when there is no user", () => {
    const { container } = renderWithQueryClient(<SetupChecklist user={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the SaaS onboarding steps for an incomplete user", () => {
    renderWithQueryClient(<SetupChecklist user={incompleteUser} />);

    expect(screen.getByText("Get started")).toBeInTheDocument();
    expect(screen.getByText("0/4 steps completed")).toBeInTheDocument();
    expect(screen.getByText("Create an organization")).toBeInTheDocument();
    expect(screen.getByText("Invite a team member")).toBeInTheDocument();
    expect(screen.getByText("Enable two-factor authentication")).toBeInTheDocument();
    expect(screen.getByText("Create an API key")).toBeInTheDocument();
  });

  it("shows completion card when all steps are done", () => {
    renderWithQueryClient(<SetupChecklist user={completeUser} />);
    expect(screen.getByText(/Onboarding complete/)).toBeInTheDocument();
  });

  it("marks onboarding complete via mutation when all steps done", async () => {
    renderWithQueryClient(<SetupChecklist user={completeUser} />);
    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(ONBOARDING_COMPLETE_PATH, {});
    });
  });

  it("can be dismissed", async () => {
    renderWithQueryClient(<SetupChecklist user={incompleteUser} />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(localStorage.getItem("za_setup_checklist_dismissed")).toBe("1");
  });
});
