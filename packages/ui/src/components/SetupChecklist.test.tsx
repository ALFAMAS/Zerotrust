import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ONBOARDING_COMPLETE_PATH } from "@/lib/server-state/auth";
import SetupChecklist from "./SetupChecklist";

const mockApiPost = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/apiClient", () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

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
  displayName: "user@example.com", // matches email → "display name" step not done
  emailVerified: false,
  avatarUrl: null,
  mfa: { totp: { enabled: false } },
};

const completeUser = {
  email: "user@example.com",
  displayName: "Complete User",
  emailVerified: true,
  avatarUrl: "https://example.com/a.png",
  mfa: { totp: { enabled: true } },
};

describe("SetupChecklist", () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiPost.mockClear();
  });

  it("renders nothing when there is no user", () => {
    const { container } = renderWithQueryClient(<SetupChecklist user={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the setup checklist with progress for an incomplete user", () => {
    renderWithQueryClient(<SetupChecklist user={incompleteUser} />);

    expect(screen.getByText("Get started")).toBeInTheDocument();
    expect(screen.getByText("0/4 steps completed")).toBeInTheDocument();
    expect(screen.getByText("Verify your email")).toBeInTheDocument();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("counts already-completed steps toward the total", () => {
    renderWithQueryClient(
      <SetupChecklist
        user={{ ...incompleteUser, emailVerified: true, mfa: { totp: { enabled: true } } }}
      />
    );
    expect(screen.getByText("2/4 steps completed")).toBeInTheDocument();
  });

  it("shows the completion card and notifies the API when all steps are done", async () => {
    renderWithQueryClient(<SetupChecklist user={completeUser} />);

    expect(await screen.findByText(/Onboarding complete!/)).toBeInTheDocument();
    expect(screen.queryByText("Get started")).not.toBeInTheDocument();
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(ONBOARDING_COMPLETE_PATH));
  });

  it("dismisses the checklist and persists the choice in localStorage", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<SetupChecklist user={incompleteUser} />);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("Get started")).not.toBeInTheDocument();
    expect(localStorage.getItem("za_setup_checklist_dismissed")).toBe("1");
  });

  it("stays dismissed across a re-render once localStorage is set", () => {
    localStorage.setItem("za_setup_checklist_dismissed", "1");
    renderWithQueryClient(<SetupChecklist user={incompleteUser} />);

    // useEffect runs after mount, so give it a tick before asserting.
    return waitFor(() => {
      expect(screen.queryByText("Get started")).not.toBeInTheDocument();
    });
  });
});
