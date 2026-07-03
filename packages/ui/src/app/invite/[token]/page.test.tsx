import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "invite-token" }),
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("../../../lib/auth", () => ({
  getToken: vi.fn(),
}));

import { getToken } from "../../../lib/auth";
import { mockApiPost } from "@/test/apiClientMock";
import InviteAcceptPage from "./page";

function renderInvite() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InviteAcceptPage />
    </QueryClientProvider>
  );
}

describe("InviteAcceptPage", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockApiPost.mockReset();
    vi.mocked(getToken).mockReset();
  });

  it("redirects unauthenticated users to login with return path", async () => {
    vi.mocked(getToken).mockReturnValue(null);
    renderInvite();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login?next=/invite/invite-token");
    });
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("accepts the invite when authenticated", async () => {
    vi.mocked(getToken).mockReturnValue("session-token");
    mockApiPost.mockResolvedValue({
      org: { id: "org-1", name: "Acme" },
      member: { role: "member" },
    });

    renderInvite();

    expect(await screen.findByText(/You've joined Acme/i)).toBeInTheDocument();
    expect(mockApiPost).toHaveBeenCalledWith("/orgs/invites/accept", { token: "invite-token" });
  });

  it("shows an error panel when acceptance fails", async () => {
    vi.mocked(getToken).mockReturnValue("session-token");
    mockApiPost.mockRejectedValue(new Error("Invite expired"));

    renderInvite();

    expect(await screen.findByText("Invite error")).toBeInTheDocument();
    expect(screen.getByText("Invite expired")).toBeInTheDocument();
  });
});
