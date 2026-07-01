import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

let searchParams = new URLSearchParams("token=reset-tok-1");
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

const mockPost = vi.fn();
vi.mock("../../../lib/api", () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

import ResetPasswordPage from "./page";

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    mockPost.mockReset();
    searchParams = new URLSearchParams("token=reset-tok-1");
  });

  it("renders the new-password form", () => {
    render(<ResetPasswordPage />);

    expect(screen.getByText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("New Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
  });

  it("rejects submission when passwords don't match, without calling the API", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New Password"), "newpassword1");
    await user.type(screen.getByLabelText("Confirm Password"), "different");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("submits the token from the URL along with the new password", async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue(undefined);

    render(<ResetPasswordPage />);
    await user.type(screen.getByLabelText("New Password"), "newpassword1");
    await user.type(screen.getByLabelText("Confirm Password"), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/auth/password-reset/reset",
        { token: "reset-tok-1", newPassword: "newpassword1" },
        true
      );
    });
    expect(await screen.findByText("Password updated")).toBeInTheDocument();
  });

  it("shows an error message when the reset request fails", async () => {
    const user = userEvent.setup();
    mockPost.mockRejectedValue(new Error("Token expired"));

    render(<ResetPasswordPage />);
    await user.type(screen.getByLabelText("New Password"), "newpassword1");
    await user.type(screen.getByLabelText("Confirm Password"), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    expect(await screen.findByText("Token expired")).toBeInTheDocument();
  });

  it("submits an empty token when none is present in the URL", async () => {
    searchParams = new URLSearchParams();
    const user = userEvent.setup();
    mockPost.mockResolvedValue(undefined);

    render(<ResetPasswordPage />);
    await user.type(screen.getByLabelText("New Password"), "newpassword1");
    await user.type(screen.getByLabelText("Confirm Password"), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/auth/password-reset/reset",
        { token: "", newPassword: "newpassword1" },
        true
      );
    });
  });
});
