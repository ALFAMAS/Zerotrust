import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "./page";
import { renderWithQueryClient } from "@/test/queryClient";
import { mockApiPost } from "@/test/apiClientMock";

describe("ForgotPasswordPage", () => {
  it("renders the request form", () => {
    renderWithQueryClient(<ForgotPasswordPage />);

    expect(screen.getByText("Reset password")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Reset Link" })).toBeInTheDocument();
  });

  it("submits the email through apiClient and shows the confirmation state", async () => {
    const user = userEvent.setup();
    mockApiPost.mockResolvedValue(undefined);

    renderWithQueryClient(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        "/auth/password-reset/request",
        { email: "person@example.com" },
        { skipAuth: true }
      );
    });
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
  });

  it("shows the confirmation state even when the API call fails", async () => {
    const user = userEvent.setup();
    mockApiPost.mockRejectedValue(new Error("boom"));

    renderWithQueryClient(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText("Email"), "nonexistent@example.com");
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
  });
});
