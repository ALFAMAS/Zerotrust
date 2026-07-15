import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/security",
}));

const navItems = [
  { href: "/dashboard", label: "Overview", exact: true, group: "Workspace" },
  { href: "/dashboard/security", label: "Security", group: "Protection" },
];

describe("Levels application shell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("marks the active destination with text, weight, and a persistent shape", () => {
    render(<AppShell navItems={navItems}>Page content</AppShell>);

    const activeLinks = screen.getAllByRole("link", { name: "Security", current: "page" });
    expect(activeLinks.length).toBeGreaterThan(0);
    for (const link of activeLinks) {
      expect(link).toHaveClass("font-semibold", "before:w-1", "before:bg-secondary-action");
    }
  });

  it("uses the wide Levels content frame and 44px topbar controls", () => {
    render(<AppShell navItems={navItems}>Page content</AppShell>);

    expect(screen.getByRole("main")).toHaveClass("max-w-[1600px]", "px-4", "sm:px-6");
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toHaveClass(
      "h-11",
      "w-11"
    );
  });

  it("renders labelled navigation groups without changing link destinations", () => {
    render(<AppShell navItems={navItems}>Page content</AppShell>);

    expect(screen.getAllByText("Workspace").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Protection").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Security" })[0]).toHaveAttribute(
      "href",
      "/dashboard/security"
    );
  });

  it("moves focus into the mobile navigation dialog and restores it", async () => {
    const user = userEvent.setup();
    render(<AppShell navItems={navItems}>Page content</AppShell>);

    const opener = screen.getByRole("button", { name: "Open navigation menu" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Navigation menu" });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement));

    await user.click(screen.getByRole("button", { name: "Close navigation menu" }));
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
