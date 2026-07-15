import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StatusPage from "./page";

const mockStatusQuery = vi.fn();
const mockHistoryQuery = vi.fn();

vi.mock("@/lib/server-state/status", () => ({
  useStatusQuery: () => mockStatusQuery(),
  useStatusHistoryQuery: () => mockHistoryQuery(),
  useStatusStream: vi.fn(),
}));

function renderPage() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="light">
      <StatusPage />
    </ThemeProvider>
  );
}

describe("StatusPage", () => {
  beforeEach(() => {
    mockHistoryQuery.mockReturnValue({ data: undefined });
    mockStatusQuery.mockReturnValue({
      data: undefined,
      dataUpdatedAt: 0,
      error: null,
      isError: false,
      isFetching: false,
      isPending: true,
      isStale: false,
      refetch: vi.fn(),
    });
  });

  it("retains the page heading while status data loads", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "System status" })).toBeInTheDocument();
    expect(screen.getByText("Loading system status…")).toBeInTheDocument();
  });

  it("labels each uptime snapshot without relying on color", () => {
    mockStatusQuery.mockReturnValue({
      data: {
        status: "operational",
        components: { api: "operational" },
        uptimeSeconds: 3600,
      },
      dataUpdatedAt: Date.parse("2026-07-15T00:00:00Z"),
      error: null,
      isError: false,
      isFetching: false,
      isPending: false,
      isStale: false,
      refetch: vi.fn(),
    });
    mockHistoryQuery.mockReturnValue({
      data: { history: [{ date: "2026-07-15", status: "operational" }] },
    });

    renderPage();

    expect(
      screen.getByRole("listitem", { name: "2026-07-15: Operational" })
    ).toBeInTheDocument();
  });
});
