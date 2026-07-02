import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiGet, mockApiPost, mockApiPostFormData } from "@/test/apiClientMock";
import {
  adminAttachmentsKeys,
  buildAttachmentsListPath,
  useAdminAttachmentsQuery,
  useTriggerLifecycleEmailsMutation,
  useUploadAdminAttachmentMutation,
} from "./adminContent";

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("adminContent server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiPostFormData.mockReset();
  });

  it("models attachment query keys and list paths", () => {
    expect(adminAttachmentsKeys.list({ limit: 20 })).toEqual([
      "admin",
      "attachments",
      "list",
      { limit: 20 },
    ]);
    expect(buildAttachmentsListPath({ limit: 20, page: 1 })).toBe(
      "/admin/attachments?page=1&limit=20"
    );
    expect(buildAttachmentsListPath()).toBe("/admin/attachments");
  });

  it("fetches attachments via apiClient", async () => {
    mockApiGet.mockResolvedValue({ data: [], pagination: { total: 0 } });
    const { result } = renderHook(() => useAdminAttachmentsQuery({ limit: 20 }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiGet).toHaveBeenCalledWith("/admin/attachments?limit=20");
  });

  it("surfaces loading and error states", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("attachments unavailable"));
    const { result } = renderHook(() => useAdminAttachmentsQuery(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("attachments unavailable");
  });

  it("uploads attachments via apiPostFormData", async () => {
    mockApiPostFormData.mockResolvedValue({ id: "att_1" });
    const formData = new FormData();
    const { result } = renderHook(() => useUploadAdminAttachmentMutation(), { wrapper: wrapper() });
    await result.current.mutateAsync(formData);
    expect(mockApiPostFormData).toHaveBeenCalledWith("/admin/attachments/upload", formData);
  });

  it("triggers lifecycle emails via apiPost", async () => {
    mockApiPost.mockResolvedValue({ results: { sent: 1, skipped: 0, errors: 0 } });
    const { result } = renderHook(() => useTriggerLifecycleEmailsMutation(), {
      wrapper: wrapper(),
    });
    await result.current.mutateAsync();
    expect(mockApiPost).toHaveBeenCalledWith("/admin/lifecycle-emails", {});
  });
});
