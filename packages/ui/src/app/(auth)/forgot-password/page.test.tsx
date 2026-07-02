import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPost = vi.fn();
vi.mock("../../../lib/api", () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

import ForgotPasswordPage from "./page";

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it("renders the request form", () => {
    render(<ForgotPasswordPage />);

    expect(screen.getByText("Reset password")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Reset Link" })).toBeInTheDocument();
  });

  it("submits the email and shows the confirmation state", async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue(undefined);

    render(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/auth/password-reset/request",
        { email: "person@example.com" },
        true
      );
    });
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
  });

  it("shows the confirmation state even when the API call fails (avoids account enumeration)", async () => {
    const user = userEvent.setup();
    mockPost.mockRejectedValue(new Error("boom"));

    render(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText("Email"), "nonexistent@example.com");
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
  });
});
