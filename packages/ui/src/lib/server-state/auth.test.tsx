import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import SetupChecklist from "@/components/SetupChecklist";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";
import {
  AUTH_ME_PATH,
  ONBOARDING_COMPLETE_PATH,
  VERIFY_EMAIL_RESEND_PATH,
  authKeys,
} from "./auth";

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPatch = vi.fn();
const mockLegacyGet = vi.fn();
const mockLegacyPost = vi.fn();
const mockLegacyPatch = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockLegacyGet(...args),
    post: (...args: unknown[]) => mockLegacyPost(...args),
    patch: (...args: unknown[]) => mockLegacyPatch(...args),
  },
}));
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
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiPatch.mockReset();
    mockLegacyGet.mockReset();
    mockLegacyPost.mockReset();
    mockLegacyPatch.mockReset();
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
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("resends verification email via mutation, not legacy api.post", async () => {
    mockApiGet.mockResolvedValue(unverifiedUser);
    mockApiPost.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    renderWithQueryClient(<VerifyEmailBanner />);

    await screen.findByText(/Please verify your email/);
    await user.click(screen.getByRole("button", { name: "Resend email" }));

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(VERIFY_EMAIL_RESEND_PATH));
    expect(mockLegacyPost).not.toHaveBeenCalled();
  });

  it("marks onboarding complete via mutation in SetupChecklist", async () => {
    mockApiPost.mockResolvedValue({ success: true });
    renderWithQueryClient(<SetupChecklist user={completeUser} />);

    expect(await screen.findByText(/Onboarding complete!/)).toBeInTheDocument();
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(ONBOARDING_COMPLETE_PATH));
    expect(mockLegacyPost).not.toHaveBeenCalled();
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
    expect(mockLegacyPatch).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });
});
