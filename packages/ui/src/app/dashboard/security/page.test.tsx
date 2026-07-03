import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiGet, mockApiPost } from "@/test/apiClientMock";
import SecurityClient from "./SecurityClient";

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
});
