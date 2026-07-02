import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet, mockApiPost } from "@/test/apiClientMock";
import {
  adminFeedbackKeys,
  buildFeedbackListPath,
  useAdminFeedbackQuery,
} from "./adminFeedback";

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("adminFeedback server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("models feedback query keys and paths", () => {
    expect(adminFeedbackKeys.list({ limit: 50 })).toEqual(["admin", "feedback", "list", { limit: 50 }]);
    expect(buildFeedbackListPath({ limit: 50 })).toBe("/admin/feedback?limit=50");
  });

  it("fetches feedback via apiClient", async () => {
    mockApiGet.mockResolvedValue({ data: [], pagination: { total: 0 } });
    const { result } = renderHook(() => useAdminFeedbackQuery({ limit: 50 }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiGet).toHaveBeenCalledWith("/admin/feedback?limit=50");
  });
});
