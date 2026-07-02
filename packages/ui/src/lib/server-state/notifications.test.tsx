import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "@/components/NotificationBell";
import NotificationSettingsPage from "@/app/dashboard/notifications/page";
import {
  NOTIFICATIONS_PATH,
  NOTIFICATIONS_PREFERENCES_PATH,
  NOTIFICATIONS_READ_ALL_PATH,
  NOTIFICATIONS_UNREAD_COUNT_PATH,
  buildNotificationReadPath,
  notificationKeys,
} from "./notifications";

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockLegacyGet = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockLegacyGet(...args),
    post: vi.fn(),
  },
}));
vi.mock("@/lib/format", () => ({
  useFormat: () => ({
    relativeTime: () => "just now",
  }),
}));

const notifications = [
  {
    id: "notif_1",
    type: "info" as const,
    title: "Welcome",
    body: "Your account is ready.",
    read: false,
    createdAt: "2026-07-01T12:00:00Z",
  },
  {
    id: "notif_2",
    type: "security" as const,
    title: "New login",
    body: "A new device signed in.",
    read: true,
    createdAt: "2026-07-01T11:00:00Z",
  },
];

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

function mockNotificationsSuccess(unreadCount = 1) {
  mockApiGet.mockImplementation((path: string) => {
    if (path === NOTIFICATIONS_UNREAD_COUNT_PATH) {
      return Promise.resolve({ count: unreadCount });
    }
    if (path === NOTIFICATIONS_PATH) {
      return Promise.resolve(notifications);
    }
    return Promise.reject(new Error(`unexpected apiGet path ${path}`));
  });
}

describe("notifications TanStack Query server state", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiPut.mockReset();
    mockLegacyGet.mockReset();
    vi.stubGlobal("EventSource", class {
      addEventListener() {}
      close() {}
    });
  });

  it("models notifications domain query keys and paths", () => {
    expect(notificationKeys.unreadCount()).toEqual(["notifications", "unreadCount"]);
    expect(notificationKeys.list()).toEqual(["notifications", "list"]);
    expect(notificationKeys.preferences()).toEqual(["notifications", "preferences"]);
    expect(NOTIFICATIONS_UNREAD_COUNT_PATH).toBe("/notifications/unread-count");
    expect(NOTIFICATIONS_PREFERENCES_PATH).toBe("/notifications/preferences");
    expect(buildNotificationReadPath("notif_1")).toBe("/notifications/notif_1/read");
  });

  it("renders unread badge through apiClient/TanStack Query, not legacy api.get", async () => {
    mockNotificationsSuccess(2);
    renderWithQueryClient(<NotificationBell />);

    expect(await screen.findByText("2")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(NOTIFICATIONS_UNREAD_COUNT_PATH);
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("loads notification list when dropdown opens", async () => {
    mockNotificationsSuccess();
    const user = userEvent.setup();
    renderWithQueryClient(<NotificationBell />);

    await screen.findByText("1");
    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(await screen.findByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("New login")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(NOTIFICATIONS_PATH);
  });

  it("marks all notifications read via mutation and invalidates notifications cache", async () => {
    mockNotificationsSuccess();
    mockApiPost.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<NotificationBell />);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await screen.findByText("1");
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await screen.findByText("Welcome");
    await user.click(screen.getByRole("button", { name: "Mark all read" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith(NOTIFICATIONS_READ_ALL_PATH)
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: notificationKeys.all });
  });

  it("renders notification preferences through apiClient/TanStack Query, not legacy api.get", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === NOTIFICATIONS_PREFERENCES_PATH) {
        return Promise.resolve({ emailFallback: true, emailFallbackDays: 3 });
      }
      return Promise.reject(new Error(`unexpected apiGet path ${path}`));
    });

    renderWithQueryClient(<NotificationSettingsPage />);

    expect(screen.getByText("Loading preferences…")).toBeInTheDocument();
    expect(await screen.findByText("Email fallback")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(NOTIFICATIONS_PREFERENCES_PATH);
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it("updates notification preferences via mutation and invalidates preferences cache", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === NOTIFICATIONS_PREFERENCES_PATH) {
        return Promise.resolve({ emailFallback: true, emailFallbackDays: 3 });
      }
      return Promise.reject(new Error(`unexpected apiGet path ${path}`));
    });
    mockApiPut.mockResolvedValue({ emailFallback: false, emailFallbackDays: 3 });

    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<NotificationSettingsPage />);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await screen.findByText("Email fallback");
    const toggles = screen.getAllByRole("checkbox");
    await user.click(toggles[1]);

    await waitFor(() =>
      expect(mockApiPut).toHaveBeenCalledWith(NOTIFICATIONS_PREFERENCES_PATH, {
        emailFallback: false,
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: notificationKeys.preferences() });
  });
});
