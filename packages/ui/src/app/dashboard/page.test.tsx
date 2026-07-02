import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import DashboardClient from "./DashboardClient";

const mockUser = {
  id: "u1",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  mfa: { totp: { enabled: false } },
  passkeys: [],
};

const mockSessions = [
  { id: "s1", isActive: true },
  { id: "s2", isActive: false },
];

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardClient />
    </QueryClientProvider>
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("renders welcome message and stats once loaded", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.resolve(mockUser);
      if (path === "/sessions") return Promise.resolve(mockSessions);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    renderDashboard();

    expect(await screen.findByText("Welcome back, Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Active sessions")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Quick links")).toBeInTheDocument();
  });

  it("shows error state when auth/me fails", async () => {
    mockApiGet.mockRejectedValue(new Error("session expired"));
    renderDashboard();

    expect(await screen.findByText("session expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows MFA enabled when TOTP is on", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/auth/me")
        return Promise.resolve({ ...mockUser, mfa: { totp: { enabled: true } } });
      if (path === "/sessions") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    renderDashboard();

    expect(await screen.findByText("Enabled")).toBeInTheDocument();
  });
});
