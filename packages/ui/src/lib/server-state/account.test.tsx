import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountPage from "@/app/dashboard/account/page";
import { mockApiDelete, mockApiGetBlob, mockApiPost } from "@/test/apiClientMock";
import {
  GDPR_ACCOUNT_PATH,
  GDPR_CANCEL_DELETION_PATH,
  GDPR_EXPORT_PATH,
  accountKeys,
} from "./account";

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

describe("account TanStack Query server state", () => {
  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  it("models account domain keys and GDPR paths", () => {
    expect(accountKeys.all).toEqual(["account"]);
    expect(GDPR_EXPORT_PATH).toBe("/gdpr/export");
    expect(GDPR_ACCOUNT_PATH).toBe("/gdpr/account");
    expect(GDPR_CANCEL_DELETION_PATH).toBe("/gdpr/account/deletion/cancel");
  });

  it("exports data via apiGetBlob mutation, not legacy api", async () => {
    mockApiGetBlob.mockResolvedValue(new Blob(['{"ok":true}'], { type: "application/json" }));
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
      const el = originalCreateElement(tagName, options);
      if (tagName === "a") {
        el.click = click;
      }
      return el;
    });

    const user = userEvent.setup();
    renderWithQueryClient(<AccountPage />);

    await user.click(screen.getByRole("button", { name: "Download my data" }));

    await waitFor(() => expect(mockApiGetBlob).toHaveBeenCalledWith(GDPR_EXPORT_PATH));
    expect(click).toHaveBeenCalled();
  });

  it("schedules account deletion via apiDelete mutation, not legacy api.delete", async () => {
    mockApiDelete.mockResolvedValue({
      scheduledFor: "2026-08-01T00:00:00Z",
      message: "Deletion scheduled",
    });

    const user = userEvent.setup();
    renderWithQueryClient(<AccountPage />);

    await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    await waitFor(() => expect(mockApiDelete).toHaveBeenCalledWith(GDPR_ACCOUNT_PATH));
    expect(await screen.findByText("Account deletion scheduled")).toBeInTheDocument();
  });

  it("cancels scheduled deletion via apiPost mutation, not legacy api.post", async () => {
    mockApiDelete.mockResolvedValue({
      scheduledFor: "2026-08-01T00:00:00Z",
      message: "Deletion scheduled",
    });
    mockApiPost.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    renderWithQueryClient(<AccountPage />);

    await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    await screen.findByText("Account deletion scheduled");

    await user.click(screen.getByRole("button", { name: "Cancel deletion request" }));

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(GDPR_CANCEL_DELETION_PATH));
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument();
  });
});
