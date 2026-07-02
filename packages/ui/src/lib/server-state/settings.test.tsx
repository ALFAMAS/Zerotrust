import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GeneralSettingsPage from "@/app/admin/settings/general/page";
import AuthSettingsPage from "@/app/admin/settings/auth/page";
import { ADMIN_SETTINGS_PATH, settingsKeys } from "./settings";

const mockApiGet = vi.fn();
const mockApiPut = vi.fn();
const mockLegacyGet = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockLegacyGet(...args),
    put: vi.fn(),
  },
}));

const settings = {
  appName: "Acme Corp",
  appUrl: "https://app.acme.com",
  supportEmail: "support@acme.com",
  logoUrl: "https://acme.com/logo.png",
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

function mockSettingsSuccess(data = settings) {
  mockApiGet.mockImplementation((path: string) => {
    if (path === ADMIN_SETTINGS_PATH) return Promise.resolve(data);
    return Promise.reject(new Error(`unexpected apiGet path ${path}`));
  });
}

describe("settings TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPut.mockReset();
    mockLegacyGet.mockReset();
  });

  it("models settings domain query keys and paths", () => {
    expect(settingsKeys.general()).toEqual(["settings", "general"]);
    expect(ADMIN_SETTINGS_PATH).toBe("/admin/settings");
  });

  it("renders settings through apiClient/TanStack Query, not legacy api.get", async () => {
    mockSettingsSuccess();
    renderWithQueryClient(<GeneralSettingsPage />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Acme Corp")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://app.acme.com")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(ADMIN_SETTINGS_PATH);
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("renders error + retry when settings load fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("settings unavailable"));
    renderWithQueryClient(<GeneralSettingsPage />);

    expect(await screen.findByText("settings unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("saves settings via mutation and invalidates settings cache", async () => {
    mockSettingsSuccess();
    mockApiPut.mockResolvedValue({
      ...settings,
      appName: "Acme Updated",
    });

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<GeneralSettingsPage />);
    await screen.findByDisplayValue("Acme Corp");

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const appNameInput = screen.getByLabelText("App Name");
    await user.clear(appNameInput);
    await user.type(appNameInput, "Acme Updated");
    await user.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() =>
      expect(mockApiPut).toHaveBeenCalledWith(ADMIN_SETTINGS_PATH, {
        appName: "Acme Updated",
        appUrl: settings.appUrl,
        supportEmail: settings.supportEmail,
        logoUrl: settings.logoUrl,
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: settingsKeys.all });
  });

  it("loads auth settings via apiClient, not raw fetch", async () => {
    mockApiGet.mockResolvedValue({
      emailPasswordEnabled: true,
      googleOAuthEnabled: true,
      allowedEmailDomains: ["acme.com"],
    });
    renderWithQueryClient(<AuthSettingsPage />);

    expect(await screen.findByText("Auth Settings")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(ADMIN_SETTINGS_PATH);
  });
});
