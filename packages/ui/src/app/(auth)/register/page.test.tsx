import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockToast = vi.fn();
vi.mock("@/lib/toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { mockApiPost } from "@/test/apiClientMock";

const mockSetToken = vi.fn();
vi.mock("../../../lib/auth", () => ({
  setToken: (...args: unknown[]) => mockSetToken(...args),
}));

const mockSolveSignupPow = vi.fn();
vi.mock("../../../lib/pow", () => ({
  solveSignupPow: () => mockSolveSignupPow(),
}));

import RegisterPage from "./page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function renderRegister() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegisterPage />
    </QueryClientProvider>
  );
}

describe("RegisterPage", () => {
  beforeEach(() => {
    mockToast.mockReset();
    mockApiPost.mockReset();
    mockSetToken.mockReset();
    mockSolveSignupPow.mockReset().mockResolvedValue({});
  });

  it("renders the sign-up form", () => {
    renderRegister();

    expect(screen.getByText("Create your account")).toBeInTheDocument();
    expect(screen.getByLabelText("Display Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("rejects submission when passwords don't match, without calling the API", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText("Display Name"), "Jane Doe");
    await user.type(screen.getByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter22222");
    await user.type(screen.getByLabelText("Confirm Password"), "different");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mockToast).toHaveBeenCalledWith({ message: "Passwords do not match", type: "error" });
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("registers, logs in, and stores tokens on success", async () => {
    const user = userEvent.setup();
    mockApiPost
      .mockResolvedValueOnce(undefined) // POST /auth/register
      .mockResolvedValueOnce({ accessToken: "at", refreshToken: "rt" }); // POST /auth/login

    renderRegister();
    await user.type(screen.getByLabelText("Display Name"), "Jane Doe");
    await user.type(screen.getByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter22222");
    await user.type(screen.getByLabelText("Confirm Password"), "hunter22222");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        "/auth/register",
        {
          email: "jane@example.com",
          password: "hunter22222",
          displayName: "Jane Doe",
        },
        { skipAuth: true }
      );
    });
    await waitFor(() => {
      expect(mockSetToken).toHaveBeenCalledWith("at", "rt");
    });
    expect(mockToast).toHaveBeenCalledWith({
      message: "Account created! Check your email to verify.",
      type: "success",
    });
  });

  it("includes the proof-of-work fields in the register payload when required", async () => {
    const user = userEvent.setup();
    mockSolveSignupPow.mockResolvedValue({ powChallenge: "chal-1", powSolution: "42" });
    mockApiPost
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ accessToken: "at", refreshToken: "rt" });

    renderRegister();
    await user.type(screen.getByLabelText("Display Name"), "Jane Doe");
    await user.type(screen.getByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter22222");
    await user.type(screen.getByLabelText("Confirm Password"), "hunter22222");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        "/auth/register",
        expect.objectContaining({ powChallenge: "chal-1", powSolution: "42" }),
        { skipAuth: true }
      );
    });
  });

  it("shows an error toast when registration fails", async () => {
    const user = userEvent.setup();
    mockApiPost.mockRejectedValueOnce(new Error("Email already registered"));

    renderRegister();
    await user.type(screen.getByLabelText("Display Name"), "Jane Doe");
    await user.type(screen.getByLabelText("Email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter22222");
    await user.type(screen.getByLabelText("Confirm Password"), "hunter22222");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        message: "Email already registered",
        type: "error",
      });
    });
    expect(mockSetToken).not.toHaveBeenCalled();
  });
});
