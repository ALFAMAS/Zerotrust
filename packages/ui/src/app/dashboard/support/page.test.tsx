import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet, mockApiPost } from "@/test/apiClientMock";
import SupportPage from "./page";

function renderSupport() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SupportPage />
    </QueryClientProvider>
  );
}

describe("SupportPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
  });

  it("renders support tickets list", async () => {
    mockApiGet.mockResolvedValue({
      tickets: [
        {
          id: "t1",
          subject: "Billing question",
          status: "open",
          createdAt: "2026-06-01T00:00:00Z",
          updatedAt: "2026-06-01T00:00:00Z",
        },
      ],
    });

    renderSupport();

    expect(await screen.findByText("Billing question")).toBeInTheDocument();
  });

  it("shows empty state when there are no tickets", async () => {
    mockApiGet.mockResolvedValue({ tickets: [] });
    renderSupport();

    expect(await screen.findByText(/no support tickets yet/i)).toBeInTheDocument();
  });

  it("associates field errors and focuses the first invalid ticket field", async () => {
    mockApiGet.mockResolvedValue({ tickets: [] });
    const user = userEvent.setup();
    renderSupport();

    await user.click(await screen.findByRole("button", { name: "New ticket" }));
    await user.click(screen.getByRole("button", { name: "Submit ticket" }));

    const subject = screen.getByLabelText("Subject");
    expect(await screen.findByText("Subject is required")).toBeInTheDocument();
    expect(screen.getByText("Message is required")).toBeInTheDocument();
    expect(subject).toHaveFocus();
    expect(subject).toHaveAttribute("aria-describedby", "support-subject-error");
  });

  it("submits a normalized ticket payload and resets after success", async () => {
    mockApiGet.mockResolvedValue({ tickets: [] });
    mockApiPost.mockResolvedValue({
      ticket: {
        id: "t2",
        subject: "Login issue",
        status: "open",
        priority: "normal",
        createdAt: "2026-07-16T00:00:00Z",
        updatedAt: "2026-07-16T00:00:00Z",
      },
      messages: [],
    });
    const user = userEvent.setup();
    renderSupport();

    await user.click(await screen.findByRole("button", { name: "New ticket" }));
    await user.type(screen.getByLabelText("Subject"), "  Login issue  ");
    await user.type(screen.getByLabelText("Message"), "  Cannot sign in  ");
    await user.click(screen.getByRole("button", { name: "Submit ticket" }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith("/support", {
        subject: "Login issue",
        message: "Cannot sign in",
        priority: "normal",
      });
    });
    expect(screen.queryByText("New support ticket")).not.toBeInTheDocument();
  });
});
