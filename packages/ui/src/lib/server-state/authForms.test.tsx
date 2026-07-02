import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import LoginPage from "@/app/(auth)/login/page";
import MagicLinkPage from "@/app/(auth)/magic-link/page";
import VerifyEmailPage from "@/app/(auth)/verify-email/page";
import {
  AUTH_LOGIN_MFA_PATH,
  AUTH_LOGIN_PATH,
  AUTH_MAGIC_LINK_SEND_PATH,
  AUTH_MAGIC_LINK_VERIFY_PATH,
  AUTH_PASSWORD_RESET_REQUEST_PATH,
  AUTH_VERIFY_EMAIL_PATH,
  useLoginMutation,
  useOAuthExchangeMutation,
  usePasskeyAuthOptionsMutation,
  useSendMagicLinkMutation,
  useVerifyEmailMutation,
  useVerifyMagicLinkMutation,
} from "@/lib/server-state/authForms";
import { mockApiPost } from "@/test/apiClientMock";

const mockSetToken = vi.fn();
let verifyEmailSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => verifyEmailSearchParams,
}));
vi.mock("@/lib/auth", () => ({
  setToken: (...args: unknown[]) => mockSetToken(...args),
  isAuthenticated: () => false,
}));
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
    mockSetToken.mockReset();
    verifyEmailSearchParams = new URLSearchParams();
  });

  it("renders the sign-in form", () => {
    renderWithQueryClient(<LoginPage />);

    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
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

  it("switches to the MFA step when the API reports mfaRequired", async () => {
    mockApiPost.mockResolvedValue({ mfaRequired: true, mfaToken: "mfa-tok-1" });
    const user = userEvent.setup();
    renderWithQueryClient(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Two-factor authentication")).toBeInTheDocument();
    expect(screen.getByLabelText("Authentication code")).toBeInTheDocument();
    expect(mockSetToken).not.toHaveBeenCalled();
  });

  it("completes login after submitting a valid MFA code", async () => {
    mockApiPost
      .mockResolvedValueOnce({ mfaRequired: true, mfaToken: "mfa-tok-1" })
      .mockResolvedValueOnce({ accessToken: "at2", refreshToken: "rt2" });

    const user = userEvent.setup();
    renderWithQueryClient(<LoginPage />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const codeInput = await screen.findByLabelText("Authentication code");
    await user.type(codeInput, "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenLastCalledWith(
        AUTH_LOGIN_MFA_PATH,
        { mfaToken: "mfa-tok-1", code: "123456" },
        { skipAuth: true }
      )
    );
    expect(mockSetToken).toHaveBeenCalledWith("at2", "rt2");
  });

  it("shows forgot-password confirmation even when the API call fails", async () => {
    mockApiPost.mockRejectedValue(new Error("boom"));

    const user = userEvent.setup();
    renderWithQueryClient(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText("Email"), "nonexistent@example.com");
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
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
        <button type="button" onClick={() => mutation.mutate({ email: "a@b.com", password: "x" })}>
          login
        </button>
      );
    }

    const user = userEvent.setup();
    renderWithQueryClient(<Probe />);
    await user.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(AUTH_LOGIN_PATH, expect.any(Object), { skipAuth: true }));
  });

  it("sends magic link via page mutation", async () => {
    mockApiPost.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithQueryClient(<MagicLinkPage />);

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Send Magic Link" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith(
        AUTH_MAGIC_LINK_SEND_PATH,
        { email: "user@example.com", redirectUrl: "/dashboard" },
        { skipAuth: true }
      )
    );
    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
  });

  it("verifies email from the verify-email page", async () => {
    mockApiPost.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderWithQueryClient(<VerifyEmailPage />);

    await screen.findByText("Verify your email");
    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify email" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith(AUTH_VERIFY_EMAIL_PATH, { code: "123456" })
    );
    expect(await screen.findByText("Email verified")).toBeInTheDocument();
  });

  it("exposes remaining auth form mutations wired to apiPost", async () => {
    mockApiPost.mockResolvedValue({ accessToken: "a", refreshToken: "r" });

    function Probe() {
      const sendMagic = useSendMagicLinkMutation();
      const verifyMagic = useVerifyMagicLinkMutation();
      const verifyEmail = useVerifyEmailMutation();
      const passkeyOptions = usePasskeyAuthOptionsMutation();
      const oauthExchange = useOAuthExchangeMutation();
      return (
        <div>
          <button type="button" onClick={() => sendMagic.mutate({ email: "a@b.com", redirectUrl: "/dashboard" })}>
            magic
          </button>
          <button type="button" onClick={() => verifyMagic.mutate({ email: "a@b.com", token: "tok" })}>
            verify-magic
          </button>
          <button type="button" onClick={() => verifyEmail.mutate({ code: "123" })}>
            verify-email
          </button>
          <button type="button" onClick={() => passkeyOptions.mutate({ email: "a@b.com" })}>
            passkey
          </button>
          <button type="button" onClick={() => oauthExchange.mutate({ code: "oauth-code" })}>
            oauth
          </button>
        </div>
      );
    }

    const user = userEvent.setup();
    renderWithQueryClient(<Probe />);

    await user.click(screen.getByRole("button", { name: "magic" }));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(AUTH_MAGIC_LINK_SEND_PATH, expect.any(Object), { skipAuth: true }));

    await user.click(screen.getByRole("button", { name: "verify-magic" }));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(AUTH_MAGIC_LINK_VERIFY_PATH, { email: "a@b.com", token: "tok" }, { skipAuth: true }));

    await user.click(screen.getByRole("button", { name: "verify-email" }));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(AUTH_VERIFY_EMAIL_PATH, { code: "123" }));

    await user.click(screen.getByRole("button", { name: "passkey" }));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith("/auth/passkey/authenticate/options", { email: "a@b.com" }, { skipAuth: true }));

    await user.click(screen.getByRole("button", { name: "oauth" }));
    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith(
        "/auth/oauth/exchange",
        { code: "oauth-code" },
        { skipAuth: true }
      )
    );
  });
});
