import { Button } from "@/components/ui/button";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import LoginPage from "@/app/(auth)/login/page";
import {
  AUTH_LOGIN_PATH,
  AUTH_PASSWORD_RESET_REQUEST_PATH,
  useLoginMutation,
} from "@/lib/server-state/authForms";
import { mockApiPost } from "@/test/apiClientMock";

vi.mock("@/lib/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/lib/safeRedirect", () => ({
  navigateToSafeRelative: vi.fn(),
  navigateToSafeExternal: vi.fn(),
}));
vi.mock("@/lib/webauthn", () => ({
  isWebAuthnAvailable: () => false,
  startAuthentication: vi.fn(),
}));
vi.mock("@/lib/server-state/auth", () => ({
  useOAuthAuthorizeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

describe("authForms TanStack Query server state", () => {
  beforeEach(() => {
    mockApiPost.mockReset();
  });

  it("models auth form domain paths", () => {
    expect(AUTH_LOGIN_PATH).toBe("/auth/login");
    expect(AUTH_PASSWORD_RESET_REQUEST_PATH).toBe("/auth/password-reset/request");
  });

  it("submits login via apiClient mutation, not legacy api.post", async () => {
    mockApiPost.mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith(
        AUTH_LOGIN_PATH,
        { email: "user@example.com", password: "secret123" },
        { skipAuth: true }
      )
    );
  });

  it("submits password reset request via skipAuth mutation", async () => {
    mockApiPost.mockResolvedValue({});

    const user = userEvent.setup();
    renderWithQueryClient(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith(
        AUTH_PASSWORD_RESET_REQUEST_PATH,
        { email: "user@example.com" },
        { skipAuth: true }
      )
    );
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
  });

  it("exposes useLoginMutation hook wired to apiPost", async () => {
    mockApiPost.mockResolvedValue({ accessToken: "a", refreshToken: "r" });

    function Probe() {
      const mutation = useLoginMutation();
      return (
        <Button type="button" onClick={() => mutation.mutate({ email: "a@b.com", password: "x" })}>
          login
        </Button>
      );
    }

    const user = userEvent.setup();
    renderWithQueryClient(<Probe />);
    await user.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(AUTH_LOGIN_PATH, expect.any(Object), { skipAuth: true }));
  });
});
