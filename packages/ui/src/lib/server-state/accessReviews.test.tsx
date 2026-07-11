import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccessReviewsPage from "@/app/admin/access-reviews/page";
import AccessReviewDetailPage from "@/app/admin/access-reviews/[id]/page";
import { mockApiGet, mockApiPost, mockApiPatch } from "@/test/apiClientMock";
import {
  ACCESS_REVIEWS_PATH,
  accessReviewKeys,
  buildAccessReviewCompletePath,
  buildAccessReviewDetailPath,
  buildAccessReviewItemPath,
} from "./accessReviews";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "rev_1" }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const review = {
  id: "rev_1",
  title: "Q3 2026 Review",
  status: "open",
  createdByEmail: "admin@example.com",
  createdAt: "2026-07-01T00:00:00Z",
  itemCount: 1,
  pendingCount: 1,
};

const item = {
  id: "item_1",
  userId: "user_1",
  userEmail: "user@example.com",
  rolesSnapshot: ["admin"],
  decision: "pending",
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

describe("accessReviews TanStack Query server state", () => {
  
  it("models access review domain query keys and paths", () => {
    expect(accessReviewKeys.list()).toEqual(["admin", "accessReviews", "list"]);
    expect(accessReviewKeys.detail("rev_1")).toEqual(["admin", "accessReviews", "detail", "rev_1"]);
    expect(buildAccessReviewDetailPath("rev_1")).toBe("/admin/access-reviews/rev_1");
    expect(buildAccessReviewItemPath("rev_1", "item_1")).toBe(
      "/admin/access-reviews/rev_1/items/item_1"
    );
    expect(buildAccessReviewCompletePath("rev_1")).toBe("/admin/access-reviews/rev_1/complete");
  });

  it("renders access review list through apiClient/TanStack Query, not legacy api", async () => {
    mockApiGet.mockResolvedValue({ reviews: [review] });

    renderWithQueryClient(<AccessReviewsPage />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("Q3 2026 Review")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(ACCESS_REVIEWS_PATH);
  });

  it("starts a review via mutation and invalidates the list", async () => {
    mockApiGet.mockResolvedValue({ reviews: [] });
    mockApiPost.mockResolvedValue({ itemCount: 2 });

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<AccessReviewsPage />);
    await screen.findByText(/No access reviews yet/);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "Start new review" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith(ACCESS_REVIEWS_PATH, {})
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: accessReviewKeys.list() });
  });

  it("renders detail and records a decision via mutation", async () => {
    mockApiGet.mockResolvedValue({ review, items: [item] });
    mockApiPatch.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    renderWithQueryClient(<AccessReviewDetailPage />);

    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(`${buildAccessReviewDetailPath("rev_1")}?limit=200`);

    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(mockApiPatch).toHaveBeenCalledWith(buildAccessReviewItemPath("rev_1", "item_1"), {
        decision: "approved",
      })
    );
  });
});
