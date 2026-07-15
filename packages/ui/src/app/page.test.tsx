import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "@/components/ThemeProvider";
import LandingPage from "./page";

function renderPage() {
  return render(
    <ThemeProvider>
      <LandingPage />
    </ThemeProvider>
  );
}

describe("Levels landing page", () => {
  it("uses the shared public chrome and one conversion-focused heading", () => {
    renderPage();

    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/ship secure auth/i);
  });

  it("removes prohibited decorative treatments", () => {
    const { container } = renderPage();

    expect(container.querySelector(".bg-grid")).not.toBeInTheDocument();
    expect(container.querySelector('[class*="blur-"]')).not.toBeInTheDocument();
    expect(container.querySelector(".shadow-2xl")).not.toBeInTheDocument();
    expect(container.querySelector('[class*="backdrop-blur"]')).not.toBeInTheDocument();
  });

  it("keeps clear primary actions, trust proof, and quickstart content", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "View API docs" })).toBeInTheDocument();
    expect(screen.getByText("200 OK")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /everything you need/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /running in minutes/i })).toBeInTheDocument();
  });
});

