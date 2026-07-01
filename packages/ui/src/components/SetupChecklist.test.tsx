import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SetupChecklist from "./SetupChecklist";

const mockPost = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/api", () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

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
    mockPost.mockClear();
  });

  it("renders nothing when there is no user", () => {
    const { container } = render(<SetupChecklist user={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the setup checklist with progress for an incomplete user", () => {
    render(<SetupChecklist user={incompleteUser} />);

    expect(screen.getByText("Get started")).toBeInTheDocument();
    expect(screen.getByText("0/4 steps completed")).toBeInTheDocument();
    expect(screen.getByText("Verify your email")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("counts already-completed steps toward the total", () => {
    render(
      <SetupChecklist
        user={{ ...incompleteUser, emailVerified: true, mfa: { totp: { enabled: true } } }}
      />
    );
    expect(screen.getByText("2/4 steps completed")).toBeInTheDocument();
  });

  it("shows the completion card and notifies the API when all steps are done", async () => {
    render(<SetupChecklist user={completeUser} />);

    expect(await screen.findByText(/Onboarding complete!/)).toBeInTheDocument();
    expect(screen.queryByText("Get started")).not.toBeInTheDocument();
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/auth/me/onboarding-complete", {}));
  });

  it("dismisses the checklist and persists the choice in localStorage", async () => {
    const user = userEvent.setup();
    render(<SetupChecklist user={incompleteUser} />);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("Get started")).not.toBeInTheDocument();
    expect(localStorage.getItem("za_setup_checklist_dismissed")).toBe("1");
  });

  it("stays dismissed across a re-render once localStorage is set", () => {
    localStorage.setItem("za_setup_checklist_dismissed", "1");
    render(<SetupChecklist user={incompleteUser} />);

    // useEffect runs after mount, so give it a tick before asserting.
    return waitFor(() => {
      expect(screen.queryByText("Get started")).not.toBeInTheDocument();
    });
  });
});
