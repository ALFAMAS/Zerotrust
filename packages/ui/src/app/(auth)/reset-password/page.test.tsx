import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiPost } from "@/test/apiClientMock";

let searchParams = new URLSearchParams("email=alice%40example.com&code=123456");
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

import ResetPasswordPage from "./page";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResetPasswordPage />
    </QueryClientProvider>
  );
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    searchParams = new URLSearchParams("email=alice%40example.com&code=123456");
  });

  it("renders the new-password form with email and code fields pre-filled from the link", () => {
    renderPage();
    expect(screen.getByText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("New Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("alice@example.com");
    expect(screen.getByLabelText("Reset code")).toHaveValue("123456");
  });

  it("rejects submission when passwords don't match, without calling the API", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("New Password"), "newpassword1");
    await user.type(screen.getByLabelText("Confirm Password"), "different");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("submits email + code + newPassword to the /confirm endpoint", async () => {
    const user = userEvent.setup();
    mockApiPost.mockResolvedValue(undefined);

    renderPage();
    await user.type(screen.getByLabelText("New Password"), "newpassword1");
    await user.type(screen.getByLabelText("Confirm Password"), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        "/auth/password-reset/confirm",
        {
          email: "alice@example.com",
          code: "123456",
          newPassword: "newpassword1",
        },
        { skipAuth: true }
      );
    });
    expect(await screen.findByText("Password updated")).toBeInTheDocument();
  });

  it("shows an error message when the reset request fails", async () => {
    const user = userEvent.setup();
    mockApiPost.mockRejectedValue(new Error("Token expired"));

    renderPage();
    await user.type(screen.getByLabelText("New Password"), "newpassword1");
    await user.type(screen.getByLabelText("Confirm Password"), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    expect(await screen.findByText("Token expired")).toBeInTheDocument();
  });
});
