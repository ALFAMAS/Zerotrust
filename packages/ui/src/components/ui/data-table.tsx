"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  type Table as TanStackTable,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Lets column defs carry cell/header alignment without leaking Tailwind
// classes into the column-definition modules that describe pure data shape.
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    className?: string;
    headerClassName?: string;
  }
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  emptyMessage?: string;
  /** Column id to hide from the visibility dropdown as well as the table (e.g. an id column). */
  initialColumnVisibility?: VisibilityState;
  search?: {
    placeholder: string;
  };
  tableLabel?: string;
  selection?: {
    getRowId: (row: TData) => string;
    rowSelection?: RowSelectionState;
    onRowSelectionChange?: OnChangeFn<RowSelectionState>;
    renderToolbar?: (context: { table: TanStackTable<TData>; selectedRows: TData[] }) => ReactNode;
  };
}

function createSelectionColumn<TData, TValue>(): ColumnDef<TData, TValue> {
  return {
    id: "select",
    enableHiding: false,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all visible rows"
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Select row ${row.id}`}
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(value === true)}
      />
    ),
  };
}

/**
 * Headless TanStack Table wired to the shared shadcn table primitives:
 * client-side column sorting (of the currently loaded rows) and a
 * show/hide-columns menu. Pagination and filtering stay server-driven by
 * the caller — this component only renders whatever `data` it is given.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  emptyMessage = "No results.",
  initialColumnVisibility,
  search,
  selection,
  tableLabel,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [internalRowSelection, setInternalRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialColumnVisibility ?? {}
  );
  const tableColumns = selection ? [createSelectionColumn<TData, TValue>(), ...columns] : columns;
  const rowSelection = selection?.rowSelection ?? internalRowSelection;

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting, columnVisibility, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: selection?.onRowSelectionChange ?? setInternalRowSelection,
    enableRowSelection: Boolean(selection),
    getRowId: selection?.getRowId,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const hideableColumns = table.getAllLeafColumns().filter((column) => column.getCanHide());
  const selectedRows = table.getSelectedRowModel().flatRows.map((row) => row.original);

  return (
    <div className="space-y-3">
      {(search || hideableColumns.length > 0 || selection?.renderToolbar) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          {search ? (
            <div className="w-full max-w-sm space-y-1">
              <Input
                type="search"
                aria-label={search.placeholder}
                placeholder={search.placeholder}
                value={globalFilter}
                onChange={(event) => setGlobalFilter(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Search applies to this page only.</p>
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {selection?.renderToolbar?.({ table, selectedRows })}
            {hideableColumns.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {hideableColumns.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {typeof column.columnDef.header === "string"
                        ? column.columnDef.header
                        : column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table aria-label={tableLabel}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const sortState = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={meta?.headerClassName}
                      aria-sort={
                        header.column.getCanSort()
                          ? sortState === "asc"
                            ? "ascending"
                            : sortState === "desc"
                              ? "descending"
                              : "none"
                          : undefined
                      }
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 hover:text-foreground",
                            meta?.headerClassName?.includes("text-right") && "flex-row-reverse"
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortState === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : sortState === "desc" ? (
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="py-8 text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="py-8 text-center text-muted-foreground"
                >
                  {data.length > 0 && globalFilter ? "No results match your search." : emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
