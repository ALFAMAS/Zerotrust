import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiDelete, mockApiGet, mockApiPost } from "@/test/apiClientMock";
import SecurityClient from "./SecurityClient";

const confirmMock = vi.fn(() => true);

vi.mock("@/lib/webauthn", () => ({
  isWebAuthnAvailable: () => false,
  startRegistration: vi.fn(),
}));

const mockUser = {
  id: "u1",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  mfa: { totp: { enabled: false } },
  passkeys: [],
  oauthProviders: [],
};

function renderSecurity() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SecurityClient />
    </QueryClientProvider>
  );
}

describe("SecurityPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiDelete.mockReset();
    confirmMock.mockReset();
    confirmMock.mockReturnValue(true);
    vi.stubGlobal("confirm", confirmMock);
  });

  it("renders security sections", async () => {
    mockApiGet.mockResolvedValue(mockUser);
    renderSecurity();

    expect(await screen.findByText("Security Settings")).toBeInTheDocument();
    expect(screen.getByText("Authenticator App (TOTP)")).toBeInTheDocument();
    expect(screen.getByText("Passkeys & Security Keys")).toBeInTheDocument();
  });

  it("starts TOTP setup flow", async () => {
    mockApiGet.mockResolvedValue(mockUser);
    mockApiPost.mockResolvedValue({ qrCodeUrl: "otpauth://totp/test" });
    const user = userEvent.setup();
    renderSecurity();
    await screen.findByText("Security Settings");

    await user.click(screen.getByRole("button", { name: "Set Up TOTP" }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith("/auth/mfa/totp/setup", {});
    });
  });

  it("shows MFA enabled badge when TOTP is active", async () => {
    mockApiGet.mockResolvedValue({
      ...mockUser,
      mfa: { totp: { enabled: true } },
    });
    renderSecurity();

    expect(await screen.findByText("Enabled")).toBeInTheDocument();
  });

  it("shows error when loading fails", async () => {
    mockApiGet.mockRejectedValue(new Error("auth failed"));
    renderSecurity();

    expect(await screen.findByText("auth failed")).toBeInTheDocument();
  });

  it("shows loading state before user data arrives", () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    renderSecurity();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("verifies TOTP and shows backup codes", async () => {
    mockApiGet.mockResolvedValue(mockUser);
    mockApiPost
      .mockResolvedValueOnce({ qrCodeUrl: "otpauth://totp/test" })
      .mockResolvedValueOnce({ backupCodes: ["111111", "222222"] });
    const user = userEvent.setup();
    renderSecurity();
    await screen.findByText("Security Settings");

    await user.click(screen.getByRole("button", { name: "Set Up TOTP" }));
    await screen.findByAltText("TOTP QR Code");

    await user.type(screen.getByPlaceholderText("Enter 6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith("/auth/mfa/totp/verify", { code: "123456" });
    });
    expect(await screen.findByText("111111")).toBeInTheDocument();
    expect(screen.getByText("222222")).toBeInTheDocument();
  });

  it("disables TOTP after confirmation", async () => {
    mockApiGet.mockResolvedValue({
      ...mockUser,
      mfa: { totp: { enabled: true, backupCodesRemaining: 3 } },
    });
    mockApiDelete.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderSecurity();
    await screen.findByText("Enabled");

    await user.click(screen.getByRole("button", { name: "Disable" }));

    expect(confirmMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith("/auth/mfa/totp");
    });
    expect(
      await screen.findByText(
        "TOTP disabled. Two-factor authentication is no longer required at login."
      )
    ).toBeInTheDocument();
  });

  it("shows passkey-unavailable message when WebAuthn is unsupported", async () => {
    mockApiGet.mockResolvedValue(mockUser);
    const user = userEvent.setup();
    renderSecurity();
    await screen.findByText("Security Settings");

    await user.click(screen.getByRole("button", { name: "Add passkey" }));

    expect(await screen.findByText("This browser does not support passkeys.")).toBeInTheDocument();
  });

  it("lists registered passkeys", async () => {
    mockApiGet.mockResolvedValue({
      ...mockUser,
      passkeys: [
        {
          credentialId: "pk1",
          name: "YubiKey",
          createdAt: "2026-01-15T10:00:00.000Z",
        },
      ],
    });
    renderSecurity();

    expect(await screen.findByText("YubiKey")).toBeInTheDocument();
    expect(screen.queryByText("No passkeys registered yet.")).not.toBeInTheDocument();
  });

  it("disconnects a linked OAuth provider after confirmation", async () => {
    mockApiGet.mockResolvedValue({
      ...mockUser,
      oauthProviders: [{ provider: "google" }],
    });
    mockApiDelete.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderSecurity();
    await screen.findByText("Connected Accounts");

    await user.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(confirmMock).toHaveBeenCalledWith("Disconnect your google account?");
    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith("/auth/oauth/google");
    });
    expect(
      await screen.findByText(
        "Disconnected google. Other active sessions may have been signed out."
      )
    ).toBeInTheDocument();
  });

  it("starts OAuth connect flow when authorize URL is returned", async () => {
    mockApiGet
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce({ authorizeUrl: "https://oauth.example/authorize" });
    const user = userEvent.setup();
    renderSecurity();
    await screen.findByText("Connected Accounts");

    const googleRow = screen.getByText("google").closest("div.flex") as HTMLElement;
    await user.click(within(googleRow).getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith("/auth/oauth/google/authorize");
    });
  });
});
