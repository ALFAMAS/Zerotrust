import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Alert } from "./alert";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardHeader } from "./card";
import { Checkbox } from "./checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Input } from "./input";
import { PasswordInput } from "./password-input";
import { Select, SelectTrigger, SelectValue } from "./select";
import { Switch } from "./switch";
import { Table, TableHead, TableHeader, TableRow } from "./table";
import { Tabs, TabsList, TabsTrigger } from "./tabs";
import { Textarea } from "./textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { ErrorState, LoadingSpinner } from "./States";

describe("Levels design foundations", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("defines the approved semantic tokens for both themes", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain("--background: #f8fafc");
    expect(css).toContain("--surface: #ffffff");
    expect(css).toContain("--foreground: #111827");
    expect(css).toContain("--secondary-action: #7c3aed");
    expect(css).toContain("--control-border: #71717a");
    expect(css).toContain("--success-subtle: #dcfce7");
    expect(css).toContain(".dark {");
    expect(css).toContain("--background: #09090b");
    expect(css).toContain("--surface: #18181b");
    expect(css).toContain("--secondary-action: #a78bfa");
    expect(css).toContain("--success-subtle: #14532d");
  });

  it("defaults to the light theme", async () => {
    render(
      <ThemeProvider>
        <div>Theme content</div>
      </ThemeProvider>
    );

    expect(screen.getByText("Theme content")).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement).toHaveClass("light"));
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("gives primary controls a 44px target and complete focus treatment", () => {
    render(
      <>
        <Button>Save settings</Button>
        <Button size="sm">Compact action</Button>
        <Input aria-label="Account name" />
      </>
    );

    expect(screen.getByRole("button", { name: "Save settings" })).toHaveClass(
      "h-11",
      "shrink-0",
      "focus-visible:ring-2"
    );
    expect(screen.getByRole("button", { name: "Compact action" })).toHaveClass("h-11");
    expect(screen.getByRole("textbox", { name: "Account name" })).toHaveClass(
      "h-11",
      "border-control"
    );
  });

  it("uses semantic status pairs instead of raw palette utilities", () => {
    render(
      <>
        <Badge variant="success">Healthy</Badge>
        <Badge variant="warning">Review</Badge>
        <Badge variant="destructive">Failed</Badge>
        <Badge {...({ status: "active" } as Record<string, string>)} />
        <Alert variant="warning">Certificate expires soon</Alert>
      </>
    );

    expect(screen.getByText("Healthy")).toHaveClass(
      "bg-success-subtle",
      "text-success-subtle-foreground"
    );
    expect(screen.getByText("Review")).toHaveClass(
      "bg-warning-subtle",
      "text-warning-subtle-foreground"
    );
    expect(screen.getByText("Failed")).toHaveClass(
      "bg-danger-subtle",
      "text-danger-subtle-foreground"
    );
    expect(screen.getByText("active")).toHaveClass(
      "bg-success-subtle",
      "text-success-subtle-foreground"
    );
    expect(screen.getByRole("alert")).toHaveClass(
      "bg-warning-subtle",
      "text-warning-subtle-foreground"
    );
  });

  it("uses border-only cards with Levels padding", () => {
    const { container } = render(
      <Card>
        <CardHeader>Header</CardHeader>
        <CardContent>Content</CardContent>
      </Card>
    );

    expect(container.firstChild).toHaveClass("rounded-xl", "border", "shadow-none");
    expect(screen.getByText("Header")).toHaveClass("p-6");
    expect(screen.getByText("Content")).toHaveClass("p-6", "pt-0");
  });

  it("applies the control contract across compound form primitives", () => {
    render(
      <>
        <Select>
          <SelectTrigger aria-label="Region">
            <SelectValue placeholder="Choose a region" />
          </SelectTrigger>
        </Select>
        <Textarea aria-label="Notes" />
        <Checkbox aria-label="Require MFA" />
        <Switch aria-label="Enable alerts" />
      </>
    );

    expect(screen.getByRole("combobox", { name: "Region" })).toHaveClass(
      "h-11",
      "border-control",
      "bg-surface"
    );
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveClass(
      "min-h-24",
      "border-control",
      "bg-surface"
    );
    expect(screen.getByRole("checkbox", { name: "Require MFA" })).toHaveClass(
      "h-11",
      "w-11",
      "focus-visible:ring-2"
    );
    expect(screen.getByRole("switch", { name: "Enable alerts" })).toHaveClass(
      "h-11",
      "w-12",
      "focus-visible:ring-2"
    );
  });

  it("keeps tabs and table headers on the Levels control rhythm", () => {
    render(
      <>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>
        </Tabs>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      </>
    );

    expect(screen.getByRole("tablist")).toHaveClass("h-11", "border");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveClass("min-h-9");
    expect(screen.getByRole("columnheader", { name: "Member" })).toHaveClass("h-11");
  });

  it("keeps the password visibility control keyboard reachable", () => {
    render(<PasswordInput aria-label="Password" />);
    const passwordToggle = screen.getByRole("button", { name: "Show password" });
    expect(passwordToggle).not.toHaveAttribute("tabindex", "-1");
    expect(passwordToggle).toHaveClass("h-11", "w-11");
  });

  it("gives the dialog close control a 44px target", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Confirm change</DialogTitle>
          <DialogDescription>This changes the active policy.</DialogDescription>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("h-11", "w-11");
  });

  it("announces loading and error states with semantic Levels styling", () => {
    render(
      <>
        <LoadingSpinner />
        <ErrorState message="Unable to load sessions" />
      </>
    );

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveClass(
      "bg-danger-subtle",
      "text-danger-subtle-foreground"
    );
  });

  it("uses elevated Levels geometry for menus and tooltips", () => {
    render(
      <TooltipProvider>
        <DropdownMenu open>
          <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Account settings</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip open>
          <TooltipTrigger>Security score</TooltipTrigger>
          <TooltipContent>Updated five minutes ago</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    expect(screen.getByRole("menu")).toHaveClass("rounded-xl", "shadow-lg");
    expect(screen.getByRole("menuitem", { name: "Account settings" })).toHaveClass(
      "min-h-9",
      "rounded-lg"
    );
    expect(screen.getByText("Updated five minutes ago", { selector: "div" })).toHaveClass(
      "rounded-lg"
    );
  });
});
