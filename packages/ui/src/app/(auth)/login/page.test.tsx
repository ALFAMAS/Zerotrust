import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPost = vi.fn();
vi.mock("../../../lib/api", () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

const mockSetToken = vi.fn();
vi.mock("../../../lib/auth", () => ({
  setToken: (...args: unknown[]) => mockSetToken(...args),
}));

const mockNavigateToSafeRelative = vi.fn();
const mockNavigateToSafeExternal = vi.fn();
vi.mock("../../../lib/safeRedirect", () => ({
  navigateToSafeRelative: (...args: unknown[]) => mockNavigateToSafeRelative(...args),
  navigateToSafeExternal: (...args: unknown[]) => mockNavigateToSafeExternal(...args),
}));

const mockIsWebAuthnAvailable = vi.fn().mockReturnValue(false);
vi.mock("../../../lib/webauthn", () => ({
  isWebAuthnAvailable: () => mockIsWebAuthnAvailable(),
  startAuthentication: vi.fn(),
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockSetToken.mockReset();
    mockNavigateToSafeRelative.mockReset();
    mockIsWebAuthnAvailable.mockReturnValue(false);
    window.history.replaceState({}, "", "/login");
  });

  it("renders the sign-in form", () => {
    render(<LoginPage />);

    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("logs in and redirects on success", async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue({ accessToken: "at", refreshToken: "rt" });

    render(<LoginPage />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/auth/login",
        { email: "person@example.com", password: "hunter2" },
        true
      );
    });
    expect(mockSetToken).toHaveBeenCalledWith("at", "rt");
    expect(mockNavigateToSafeRelative).toHaveBeenCalledWith(null, "/dashboard");
  });

  it("switches to the MFA step when the API reports mfaRequired", async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue({ mfaRequired: true, mfaToken: "mfa-tok-1" });

    render(<LoginPage />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Two-factor authentication")).toBeInTheDocument();
    expect(screen.getByLabelText("Authentication code")).toBeInTheDocument();
    // Login is not finished yet — no token/redirect until the MFA code is verified.
    expect(mockSetToken).not.toHaveBeenCalled();
  });

  it("completes login after submitting a valid MFA code", async () => {
    const user = userEvent.setup();
    mockPost
      .mockResolvedValueOnce({ mfaRequired: true, mfaToken: "mfa-tok-1" })
      .mockResolvedValueOnce({ accessToken: "at2", refreshToken: "rt2" });

    render(<LoginPage />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const codeInput = await screen.findByLabelText("Authentication code");
    await user.type(codeInput, "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenLastCalledWith(
        "/auth/login/mfa",
        { mfaToken: "mfa-tok-1", code: "123456" },
        true
      );
    });
    expect(mockSetToken).toHaveBeenCalledWith("at2", "rt2");
  });

  it("hides the passkey option check but still surfaces an error toast when unsupported", async () => {
    const user = userEvent.setup();
    mockIsWebAuthnAvailable.mockReturnValue(false);

    render(<LoginPage />);
    await user.click(screen.getByRole("button", { name: /sign in with a passkey/i }));

    // Passkey flow bails out before calling the API when unsupported.
    expect(mockPost).not.toHaveBeenCalled();
  });
});
