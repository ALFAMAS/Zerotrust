import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import AdminFeedbackPage from "./page";

function renderFeedback() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminFeedbackPage />
    </QueryClientProvider>
  );
}

describe("AdminFeedbackPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("renders feedback inbox entries", async () => {
    mockApiGet.mockResolvedValue({
      data: [
        {
          id: "f1",
          userId: "u1",
          orgId: null,
          type: "nps",
          score: 9,
          comment: "Great product",
          context: null,
          createdAt: "2026-06-01T00:00:00Z",
        },
      ],
      pagination: { total: 1 },
    });

    renderFeedback();

    expect(await screen.findByText("Great product")).toBeInTheDocument();
  });
});
