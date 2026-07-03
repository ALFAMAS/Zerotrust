import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApiDelete, mockApiGet } from "@/test/apiClientMock";
import SettingsClient from "./SettingsClient";

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsClient />
    </QueryClientProvider>
  );
}

describe("SettingsClient", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiDelete.mockReset();
  });

  it("renders connected OAuth providers", async () => {
    mockApiGet.mockResolvedValue({ google: true, github: false });
    renderSettings();

    expect(await screen.findByText("Connected Apps")).toBeInTheDocument();
    expect(await screen.findByText("Google")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("disconnects a linked provider", async () => {
    mockApiGet.mockResolvedValue({ google: true, github: false });
    mockApiDelete.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderSettings();

    await screen.findByText("Google");
    await user.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith("/auth/oauth/google");
    });
  });

  it("shows error state when provider fetch fails", async () => {
    mockApiGet.mockRejectedValue(new Error("providers unavailable"));
    renderSettings();

    expect(await screen.findByText("providers unavailable")).toBeInTheDocument();
  });
});
