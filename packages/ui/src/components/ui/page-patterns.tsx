import type { FormHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ActionGroupProps extends HTMLAttributes<HTMLElement> {
  label?: string;
  children?: ReactNode;
}

export function ActionGroup({ label = "Page actions", className, ...props }: ActionGroupProps) {
  return (
    <section
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-2 sm:justify-end", className)}
      {...props}
    />
  );
}

interface MetricProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}

export function Metric({ label, value, hint, icon, className, ...props }: MetricProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-6", className)} {...props}>
      {icon}
      <dl className={cn(icon && "mt-4")}>
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </dd>
      </dl>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

interface FilterBarProps extends FormHTMLAttributes<HTMLFormElement> {
  label?: string;
}

export function FilterBar({ label = "Filters", className, ...props }: FilterBarProps) {
  return (
    // A form with the search landmark is supported by our DOM test/runtime matrix;
    // happy-dom does not yet expose the equivalent native <search> semantics.
    // biome-ignore lint/a11y/useSemanticElements: see compatibility note above
    <form
      aria-label={label}
      role="search"
      className={cn("flex flex-wrap items-end gap-4", className)}
      {...props}
    />
  );
}

interface TitledSectionProps extends HTMLAttributes<HTMLElement> {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function FormSection({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: TitledSectionProps) {
  return (
    <section
      aria-label={title}
      className={cn("rounded-xl border border-border bg-surface p-6", className)}
      {...props}
    >
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <ActionGroup label={`${title} actions`}>{actions}</ActionGroup> : null}
      </header>
      {children}
    </section>
  );
}

export function DataRegion({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: TitledSectionProps) {
  return (
    <section
      aria-label={title}
      className={cn("overflow-hidden rounded-xl border border-border bg-surface", className)}
      {...props}
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <ActionGroup label={`${title} actions`}>{actions}</ActionGroup> : null}
      </header>
      {children}
    </section>
  );
}

export function DangerZone({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: TitledSectionProps) {
  return (
    <section
      aria-label={title}
      className={cn("rounded-xl border border-destructive bg-surface p-6", className)}
      {...props}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-danger-subtle-foreground">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <ActionGroup label={`${title} actions`}>{actions}</ActionGroup> : null}
      </header>
      {children}
    </section>
  );
}
