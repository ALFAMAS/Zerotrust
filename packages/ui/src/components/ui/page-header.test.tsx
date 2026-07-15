import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("provides one labelled page heading and supporting description", () => {
    render(<PageHeader title="Security" description="Manage sign-in protection." />);

    expect(screen.getByRole("heading", { level: 1, name: "Security" })).toBeInTheDocument();
    expect(screen.getByText("Manage sign-in protection.")).toBeInTheDocument();
  });

  it("keeps page actions in a labelled, wrapping action group", () => {
    render(
      <PageHeader title="API keys" actions={<button type="button">Create API key</button>} />
    );

    expect(screen.getByRole("region", { name: "Page actions" })).toHaveClass(
      "flex-wrap",
      "sm:justify-end"
    );
  });
});
