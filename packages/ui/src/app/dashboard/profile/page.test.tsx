import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiGet, mockApiPatch } from "@/test/apiClientMock";
import ProfilePage from "./page";

const mockUser = {
  id: "u1",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  username: "ada",
  phone: "+15551234567",
  avatarUrl: null,
  mfa: { totp: { enabled: false } },
};

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfilePage />
    </QueryClientProvider>
  );
}

describe("ProfilePage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPatch.mockReset();
    window.confirm = vi.fn(() => true);
  });

  it("renders profile form with user data", async () => {
    mockApiGet.mockResolvedValue(mockUser);
    renderProfile();

    expect(await screen.findByText("Profile Settings")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ada@example.com")).toBeInTheDocument();
  });

  it("saves profile changes", async () => {
    mockApiGet.mockResolvedValue(mockUser);
    mockApiPatch.mockResolvedValue({ ...mockUser, displayName: "Ada L." });
    const user = userEvent.setup();
    renderProfile();
    await screen.findByDisplayValue("Ada Lovelace");

    await user.clear(screen.getByLabelText("Display Name"));
    await user.type(screen.getByLabelText("Display Name"), "Ada L.");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith("/auth/me", expect.objectContaining({ displayName: "Ada L." }));
    });
    expect(await screen.findByText("Profile updated successfully.")).toBeInTheDocument();
  });

  it("opens enlarged profile photo when avatar is clicked", async () => {
    mockApiGet.mockResolvedValue({
      ...mockUser,
      avatarUrl: "https://example.com/avatar.png",
    });
    const user = userEvent.setup();
    renderProfile();
    await screen.findByText("Profile Settings");

    await user.click(await screen.findByRole("button", { name: "View profile photo" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Profile photo" })).toBeInTheDocument();
    expect(screen.getByAltText("Profile avatar of Ada Lovelace")).toBeInTheDocument();
  });

  it("shows error when loading fails", async () => {
    mockApiGet.mockRejectedValue(new Error("network error"));
    renderProfile();

    expect(await screen.findByText("network error")).toBeInTheDocument();
  });
});
