import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AuthLayout from "./layout";

describe("Levels authentication shell", () => {
  it("keeps the authentication task focused and free of decorative effects", () => {
    const { container } = render(
      <AuthLayout>
        <h1>Sign in</h1>
      </AuthLayout>
    );

    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { name: "Sign in" }));
    expect(container.querySelector(".bg-grid")).not.toBeInTheDocument();
    expect(container.querySelector('[class*="blur-"]')).not.toBeInTheDocument();
    expect(container.querySelector(".shadow-2xl")).not.toBeInTheDocument();
  });

  it("uses a border-only Levels form panel and clear trust context", () => {
    render(
      <AuthLayout>
        <h1>Sign in</h1>
      </AuthLayout>
    );

    const formPanel = screen.getByRole("heading", { name: "Sign in" }).parentElement;
    expect(formPanel).toHaveClass("rounded-xl", "border", "bg-surface", "shadow-none");
    expect(screen.getByText(/zero-trust by default/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to home/i })).toHaveClass("underline");
  });
});

