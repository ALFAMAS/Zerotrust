import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ActionGroup } from "./page-patterns";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}
    >
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-secondary-action">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <ActionGroup>{actions}</ActionGroup> : null}
    </header>
  );
}
