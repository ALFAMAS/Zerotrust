import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserDetailPage from "@/app/admin/users/[id]/page";
import {
  adminUserKeys,
  buildAdminUserDetailPath,
  buildAdminUserSegmentPath,
} from "./adminUsers";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "user_abc" }),
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}));

const mockApiGet = vi.fn();
const mockApiPatch = vi.fn();
const mockApiPut = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();
const mockLegacyGet = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockLegacyGet(...args),
    patch: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const user = {
  id: "user_abc",
  email: "alice@example.com",
  displayName: "Alice",
  status: "active" as const,
  createdAt: "2026-01-01T00:00:00Z",
  activeSessions: 2,
  customerSegment: null,
  mfa: { totpEnabled: true, webauthnEnabled: false },
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

function mockUserDetailSuccess(data = user) {
  mockApiGet.mockImplementation((path: string) => {
    if (path === buildAdminUserDetailPath("user_abc")) return Promise.resolve(data);
    return Promise.reject(new Error(`unexpected apiGet path ${path}`));
  });
}

describe("adminUsers TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPatch.mockReset();
    mockApiPut.mockReset();
    mockApiPost.mockReset();
    mockApiDelete.mockReset();
    mockLegacyGet.mockReset();
  });

  it("models admin user domain query keys and paths", () => {
    expect(adminUserKeys.detail("user_abc")).toEqual(["admin", "users", "detail", "user_abc"]);
    expect(buildAdminUserDetailPath("user_abc")).toBe("/admin/users/user_abc");
    expect(buildAdminUserSegmentPath("user_abc")).toBe("/admin/users/user_abc/segment");
  });

  it("renders user detail through apiClient/TanStack Query, not legacy api.get", async () => {
    mockUserDetailSuccess();
    renderWithQueryClient(<UserDetailPage />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith("/admin/users/user_abc");
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("renders error + retry when user detail load fails", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("user unavailable"));
    renderWithQueryClient(<UserDetailPage />);

    expect(await screen.findByText("user unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("uses status mutation with optimistic update and invalidates user caches", async () => {
    mockUserDetailSuccess();
    mockApiPatch.mockResolvedValue({ ...user, status: "suspended" });

    const userEvt = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<UserDetailPage />);
    await screen.findByText("Alice");

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await userEvt.click(screen.getByRole("button", { name: "Suspend User" }));

    await waitFor(() =>
      expect(mockApiPatch).toHaveBeenCalledWith("/admin/users/user_abc", { status: "suspended" })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: adminUserKeys.detail("user_abc"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminUserKeys.list() });
  });
});
