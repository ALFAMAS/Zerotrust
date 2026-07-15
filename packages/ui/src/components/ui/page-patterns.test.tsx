import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ActionGroup,
  DangerZone,
  DataRegion,
  FilterBar,
  FormSection,
  Metric,
} from "./page-patterns";

describe("Levels page patterns", () => {
  it("labels wrapping page and filter actions", () => {
    render(
      <>
        <ActionGroup>
          <button type="button">Create key</button>
        </ActionGroup>
        <FilterBar>
          <label htmlFor="query">Search</label>
          <input id="query" />
        </FilterBar>
      </>
    );

    expect(screen.getByRole("region", { name: "Page actions" })).toHaveClass("flex-wrap");
    expect(screen.getByRole("search", { name: "Filters" })).toHaveClass("flex-wrap");
  });

  it("preserves metric label and value relationships", () => {
    render(<Metric label="Active sessions" value="24" hint="Last 24 hours" />);

    expect(screen.getByText("Active sessions").tagName).toBe("DT");
    expect(screen.getByText("24").tagName).toBe("DD");
    expect(screen.getByText("Last 24 hours")).toBeInTheDocument();
  });

  it("labels form, data, and destructive regions", () => {
    render(
      <>
        <FormSection title="Organization profile">Form fields</FormSection>
        <DataRegion title="Members">Member table</DataRegion>
        <DangerZone title="Delete organization">Destructive controls</DangerZone>
      </>
    );

    expect(screen.getByRole("region", { name: "Organization profile" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Members" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Delete organization" })).toHaveClass(
      "border-destructive"
    );
  });
});
