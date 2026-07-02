import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiGet } from "@/test/apiClientMock";
import NotificationSettingsPage from "./page";
import { NOTIFICATIONS_PREFERENCES_PATH } from "@/lib/server-state/notifications";

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/push", () => ({
  isPushSupported: () => false,
  isSubscribed: () => Promise.resolve(false),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));

function renderNotifications() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationSettingsPage />
    </QueryClientProvider>
  );
}

describe("NotificationSettingsPage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("renders notification preference categories", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === NOTIFICATIONS_PREFERENCES_PATH) {
        return Promise.resolve({ emailFallback: true, emailFallbackDays: 3, categories: {} });
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    });

    renderNotifications();

    expect(await screen.findByText("Email fallback")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
  });
});
