import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet, mockApiPost } from "@/test/apiClientMock";
import {
  adminSearchKeys,
  useIndexDocumentMutation,
  useSearchProviderQuery,
} from "./adminSearch";

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("adminSearch server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
  });

  it("models search index keys", () => {
    expect(adminSearchKeys.provider()).toEqual(["admin", "searchIndex", "provider"]);
  });

  it("fetches search provider via apiClient", async () => {
    mockApiGet.mockResolvedValue({ provider: "postgres" });
    const { result } = renderHook(() => useSearchProviderQuery(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiGet).toHaveBeenCalledWith("/search/provider");
  });

  it("indexes documents via apiPost", async () => {
    mockApiPost.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useIndexDocumentMutation(), { wrapper: wrapper() });
    await result.current.mutateAsync({
      id: "u1",
      type: "user",
      orgId: "00000000-0000-4000-8000-000000000001",
      title: "Test",
    });
    expect(mockApiPost).toHaveBeenCalledWith("/search/index", expect.any(Object));
  });
});
