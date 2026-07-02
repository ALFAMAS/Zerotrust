import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import SetupChecklist from "@/components/SetupChecklist";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";
import SettingsPage from "@/app/dashboard/settings/page";
import ProfilePage from "@/app/dashboard/profile/page";
import DashboardPage from "@/app/dashboard/page";
import SecurityPage from "@/app/dashboard/security/page";
import { mockApiGet, mockApiPost, mockApiPatch, mockApiPostFormData, mockApiDelete } from "@/test/apiClientMock";
import {
  AUTH_ME_PATH,
  AUTH_ME_AVATAR_PATH,
  ONBOARDING_COMPLETE_PATH,
  OAUTH_PROVIDERS_PATH,
  TOTP_PATH,
  TOTP_SETUP_PATH,
  TOTP_VERIFY_PATH,
  VERIFY_EMAIL_RESEND_PATH,
  authKeys,
} from "./auth";
import { USER_SESSIONS_PATH, userSessionKeys } from "./sessions";

vi.mock("@/lib/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const unverifiedUser = {
  id: "user_1",
  email: "user@example.com",
  emailVerified: false,
};

const completeUser = {
  email: "user@example.com",
  displayName: "Complete User",
  emailVerified: true,
  avatarUrl: "https://example.com/a.png",
  mfa: { totp: { enabled: true } },
};

const userWithoutMfa = {
  email: "user@example.com",
  displayName: "Complete User",
  emailVerified: true,
  avatarUrl: null,
  mfa: { totp: { enabled: false } },
  passkeys: [],
  oauth: { google: false, github: false },
};

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...result, queryClient };
}

describe("auth TanStack Query server state", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("models auth domain query keys and paths", () => {
    expect(authKeys.me()).toEqual(["auth", "me"]);
    expect(AUTH_ME_PATH).toBe("/auth/me");
    expect(VERIFY_EMAIL_RESEND_PATH).toBe("/auth/verify-email/resend");
    expect(ONBOARDING_COMPLETE_PATH).toBe("/auth/me/onboarding-complete");
  });

  it("loads current user through apiClient/TanStack Query for VerifyEmailBanner", async () => {
    mockApiGet.mockResolvedValue(unverifiedUser);
    renderWithQueryClient(<VerifyEmailBanner />);

    expect(await screen.findByText(/Please verify your email/)).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(AUTH_ME_PATH);
  });

  it("resends verification email via mutation, not legacy api.post", async () => {
    mockApiGet.mockResolvedValue(unverifiedUser);
    mockApiPost.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    renderWithQueryClient(<VerifyEmailBanner />);

    await screen.findByText(/Please verify your email/);
    await user.click(screen.getByRole("button", { name: "Resend email" }));

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(VERIFY_EMAIL_RESEND_PATH));
  });

  it("marks onboarding complete via mutation in SetupChecklist", async () => {
    mockApiPost.mockResolvedValue({ success: true });
    renderWithQueryClient(<SetupChecklist user={completeUser} />);

    expect(await screen.findByText(/Onboarding complete!/)).toBeInTheDocument();
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(ONBOARDING_COMPLETE_PATH));
  });

  it("persists locale via patch mutation in LocaleSwitcher when signed in", async () => {
    localStorage.setItem("za_access_token", "token_1");
    mockApiPatch.mockResolvedValue({ locale: "es" });
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LocaleSwitcher />);

    await user.click(screen.getByRole("button", { name: "Switch language" }));
    await user.click(screen.getByRole("option", { name: /Español/ }));

    await waitFor(() =>
      expect(mockApiPatch).toHaveBeenCalledWith(AUTH_ME_PATH, { locale: "es" })
    );
    expect(reload).toHaveBeenCalled();
  });

  it("loads OAuth providers through apiClient/TanStack Query for settings page", async () => {
    mockApiGet.mockResolvedValue({ google: true, github: false });
    renderWithQueryClient(<SettingsPage />);

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(OAUTH_PROVIDERS_PATH);
  });

  it("disconnects OAuth provider via apiDelete mutation, not legacy api.delete", async () => {
    mockApiGet.mockResolvedValue({ google: true, github: false });
    mockApiDelete.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<SettingsPage />);
    await screen.findByText("Connected");

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() => expect(mockApiDelete).toHaveBeenCalledWith("/auth/oauth/google"));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: authKeys.oauthProviders() });
  });

  it("loads profile through useAuthMeQuery on profile page, not legacy api.get", async () => {
    mockApiGet.mockResolvedValue(completeUser);
    renderWithQueryClient(<ProfilePage />);

    expect(await screen.findByDisplayValue("Complete User")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(AUTH_ME_PATH);
  });

  it("patches profile via mutation on profile page, not legacy api.patch", async () => {
    mockApiGet.mockResolvedValue(completeUser);
    mockApiPatch.mockResolvedValue({ displayName: "Updated User" });

    const user = userEvent.setup();
    renderWithQueryClient(<ProfilePage />);
    await screen.findByDisplayValue("Complete User");

    await user.clear(screen.getByLabelText("Display Name"));
    await user.type(screen.getByLabelText("Display Name"), "Updated User");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(mockApiPatch).toHaveBeenCalledWith(AUTH_ME_PATH, {
        displayName: "Updated User",
        avatarUrl: "https://example.com/a.png",
        phone: null,
        username: null,
      })
    );
  });

  it("disables TOTP via apiDelete mutation on profile page", async () => {
    mockApiGet.mockResolvedValue(completeUser);
    mockApiDelete.mockResolvedValue({ success: true });
    vi.stubGlobal("confirm", () => true);

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<ProfilePage />);
    await screen.findByText("Disable two-factor authentication");

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "Disable two-factor authentication" }));

    await waitFor(() => expect(mockApiDelete).toHaveBeenCalledWith(TOTP_PATH));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: authKeys.me() });
  });

  it("loads dashboard home via auth + user sessions queries, not legacy api", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === AUTH_ME_PATH) return Promise.resolve(completeUser);
      if (path === USER_SESSIONS_PATH) return Promise.resolve({ data: [{ id: "s1", isActive: true }] });
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    renderWithQueryClient(<DashboardPage />);

    expect(await screen.findByText(/Welcome back, Complete User/)).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(AUTH_ME_PATH);
    expect(mockApiGet).toHaveBeenCalledWith(USER_SESSIONS_PATH);
    expect(userSessionKeys.list()).toEqual(["sessions", "list"]);
  });

  it("renders dashboard error + retry when auth/me fails", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === AUTH_ME_PATH) return Promise.reject(new Error("dashboard unavailable"));
      if (path === USER_SESSIONS_PATH) return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    renderWithQueryClient(<DashboardPage />);

    expect(await screen.findByText("dashboard unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("loads security settings through useAuthMeQuery", async () => {
    mockApiGet.mockResolvedValue(userWithoutMfa);
    renderWithQueryClient(<SecurityPage />);

    expect(await screen.findByText("Security Settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Up TOTP" })).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(AUTH_ME_PATH);
  });

  it("starts TOTP setup via mutation on security page", async () => {
    mockApiGet.mockResolvedValue(userWithoutMfa);
    mockApiPost.mockResolvedValue({ qrCodeUrl: "data:image/png;base64,abc" });

    const user = userEvent.setup();
    renderWithQueryClient(<SecurityPage />);
    await screen.findByRole("button", { name: "Set Up TOTP" });

    await user.click(screen.getByRole("button", { name: "Set Up TOTP" }));

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(TOTP_SETUP_PATH));
    expect(await screen.findByAltText("TOTP QR Code")).toBeInTheDocument();
  });

  it("verifies TOTP code on security page", async () => {
    mockApiGet.mockResolvedValue(userWithoutMfa);
    mockApiPost
      .mockResolvedValueOnce({ qrCodeUrl: "data:image/png;base64,abc" })
      .mockResolvedValueOnce({ backupCodes: ["code-1", "code-2"] });

    const user = userEvent.setup();
    renderWithQueryClient(<SecurityPage />);
    await screen.findByRole("button", { name: "Set Up TOTP" });
    await user.click(screen.getByRole("button", { name: "Set Up TOTP" }));
    await screen.findByAltText("TOTP QR Code");

    await user.type(screen.getByPlaceholderText("Enter 6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith(TOTP_VERIFY_PATH, { code: "123456" })
    );
    expect(await screen.findByText("Save your backup codes")).toBeInTheDocument();
  });

  it("renders security error + retry when user load fails", async () => {
    mockApiGet.mockRejectedValue(new Error("security unavailable"));
    renderWithQueryClient(<SecurityPage />);

    expect(await screen.findByText("security unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
