import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiPost } from "@/test/apiClientMock";

vi.mock("@/lib/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import ForgotPasswordPage from "./page";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ForgotPasswordPage />
    </QueryClientProvider>
  );
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    mockApiPost.mockReset();
  });

  it("renders the request form", () => {
    renderPage();

    expect(screen.getByText("Reset password")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("submits the reset request via apiClient", async () => {
    mockApiPost.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith(
        "/auth/password-reset/request",
        { email: "user@example.com" },
        { skipAuth: true }
      )
    );
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
  });
});
