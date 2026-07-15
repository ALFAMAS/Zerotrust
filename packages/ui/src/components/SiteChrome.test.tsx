import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "@/components/ThemeProvider";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

function renderHeader() {
  return render(
    <ThemeProvider>
      <SiteHeader />
    </ThemeProvider>
  );
}

describe("Levels public chrome", () => {
  it("uses semantic surfaces and complete desktop navigation", () => {
    renderHeader();

    expect(screen.getByRole("banner")).toHaveClass("bg-surface");
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Features" })).toHaveClass("min-h-11");
    expect(screen.getByRole("link", { name: "Get started" })).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: /switch to (?:dark|light) mode/i })).toHaveClass(
      "h-11",
      "w-11"
    );

    const brandMark = screen.getByRole("link", { name: /home/i }).firstElementChild;
    expect(brandMark).toHaveClass("bg-primary", "text-primary-foreground");
    expect(brandMark).not.toHaveAttribute("style");
  });

  it("provides a focus-managed mobile navigation dialog", async () => {
    const user = userEvent.setup();
    renderHeader();

    const opener = screen.getByRole("button", { name: "Open navigation" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Mobile navigation" });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement));
    expect(within(dialog).getByRole("link", { name: "Features" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close navigation" }));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("uses one labelled footer navigation with visible link affordances", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("contentinfo")).toHaveClass("bg-surface");
    const footerNav = screen.getByRole("navigation", { name: "Footer navigation" });
    expect(footerNav).toBeInTheDocument();
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("underline");
    }
  });
});
