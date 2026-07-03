import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet, mockApiPost } from "@/test/apiClientMock";
import AccessReviewsPage from "./page";

function renderAccessReviews() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccessReviewsPage />
    </QueryClientProvider>
  );
}

describe("AccessReviewsPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
  });

  it("renders access review history", async () => {
    mockApiGet.mockResolvedValue({
      reviews: [
        {
          id: "rev-1",
          title: "Q3 2026 privileged access review",
          status: "completed",
          itemCount: 5,
          pendingCount: 0,
          createdByEmail: "admin@example.com",
          createdAt: "2026-07-01T00:00:00Z",
          completedAt: "2026-07-02T00:00:00Z",
        },
      ],
    });

    renderAccessReviews();

    expect(await screen.findByText("Access Reviews")).toBeInTheDocument();
    expect(await screen.findByText("Q3 2026 privileged access review")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("starts a new review from the admin action", async () => {
    mockApiGet.mockResolvedValue({ reviews: [] });
    mockApiPost.mockResolvedValue({ itemCount: 3 });
    const user = userEvent.setup();
    renderAccessReviews();

    await user.click(await screen.findByRole("button", { name: "Start new review" }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith("/admin/access-reviews", {});
    });
    expect(
      await screen.findByText("Review started — 3 privileged user(s) to review")
    ).toBeInTheDocument();
  });

  it("shows empty state when no reviews exist", async () => {
    mockApiGet.mockResolvedValue({ reviews: [] });
    renderAccessReviews();

    expect(
      await screen.findByText(/No access reviews yet/i)
    ).toBeInTheDocument();
  });
});
