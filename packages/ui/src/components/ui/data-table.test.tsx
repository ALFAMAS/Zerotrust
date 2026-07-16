import type { ColumnDef } from "@tanstack/react-table";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataTable } from "./data-table";

interface Person {
  id: string;
  name: string;
  email: string;
}

const columns: ColumnDef<Person>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
];

const people: Person[] = [
  { id: "ada", name: "Ada Lovelace", email: "ada@example.com" },
  { id: "grace", name: "Grace Hopper", email: "grace@example.com" },
];

describe("DataTable", () => {
  it("filters supplied rows and explains that search is limited to the current page", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={columns}
        data={people}
        search={{ placeholder: "Search people" }}
      />
    );

    expect(screen.getByText("Search applies to this page only.")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search people" }), "grace");

    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });

  it("distinguishes an empty dataset from a search with no matches", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={people}
        emptyMessage="No people yet."
        search={{ placeholder: "Search people" }}
      />
    );

    await user.type(screen.getByRole("searchbox", { name: "Search people" }), "nobody");
    expect(screen.getByText("No results match your search.")).toBeInTheDocument();
    expect(screen.queryByText("No people yet.")).not.toBeInTheDocument();

    rerender(
      <DataTable
        columns={columns}
        data={[]}
        emptyMessage="No people yet."
        search={{ placeholder: "Search people" }}
      />
    );

    expect(screen.getByText("No people yet.")).toBeInTheDocument();
  });

  it("selects filtered rows by stable id and exposes them to toolbar actions", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={columns}
        data={people}
        search={{ placeholder: "Search people" }}
        selection={{
          getRowId: (person) => person.id,
          renderToolbar: ({ selectedRows }) => (
            <span>{selectedRows.length} selected</span>
          ),
        }}
      />
    );

    await user.type(screen.getByRole("searchbox", { name: "Search people" }), "grace");
    await user.click(screen.getByRole("checkbox", { name: "Select all visible rows" }));

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select row grace" })).toBeChecked();

    await user.clear(screen.getByRole("searchbox", { name: "Search people" }));

    expect(screen.getByRole("checkbox", { name: "Select row ada" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select row grace" })).toBeChecked();
  });

  it("gives the table an accessible label", () => {
    render(<DataTable columns={columns} data={people} tableLabel="People" />);

    expect(screen.getByRole("table", { name: "People" })).toBeInTheDocument();
  });

  it("exposes sorting state to assistive technology", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={[people[1], people[0]]} />);

    const nameHeader = screen.getByRole("columnheader", { name: "Name" });
    expect(nameHeader).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: "Name" }));
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: "Name" }));
    expect(nameHeader).toHaveAttribute("aria-sort", "descending");
  });

  it("lets users hide and restore columns", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={people} tableLabel="People" />);
    const table = screen.getByRole("table", { name: "People" });

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Email" }));

    expect(within(table).queryByText("ada@example.com")).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Email" }));
    expect(within(table).getByText("ada@example.com")).toBeInTheDocument();
  });

  it("renders loading and empty states inside the table", () => {
    const { rerender } = render(
      <DataTable columns={columns} data={[]} isLoading tableLabel="People" />
    );

    expect(screen.getByRole("cell", { name: "Loading…" })).toHaveAttribute("colspan", "2");

    rerender(
      <DataTable columns={columns} data={[]} emptyMessage="No people yet." tableLabel="People" />
    );
    expect(screen.getByRole("cell", { name: "No people yet." })).toHaveAttribute("colspan", "2");
  });
});
