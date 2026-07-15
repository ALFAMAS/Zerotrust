import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { describe, expect, it } from "vitest";
import HelpPage from "./page";

function renderPage() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="light">
      <HelpPage />
    </ThemeProvider>
  );
}

describe("HelpPage", () => {
  it("gives the FAQ search a persistent programmatic label", () => {
    renderPage();

    expect(screen.getByRole("searchbox", { name: "Search help articles" })).toBeInTheDocument();
    expect(screen.getByText("Search help articles")).toBeInTheDocument();
  });

  it("exposes FAQ disclosure state and its controlled answer", () => {
    renderPage();

    const question = screen.getByRole("button", { name: /how do i reset my password/i });
    expect(question).toHaveAttribute("aria-expanded", "false");
    expect(question).toHaveAttribute("aria-controls");

    fireEvent.click(question);

    expect(question).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(question.getAttribute("aria-controls") ?? "")).toBeVisible();
  });
});
