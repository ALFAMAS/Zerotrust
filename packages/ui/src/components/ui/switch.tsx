"use client";

import * as SwitchPrimitives from "@radix-ui/react-switch";
import * as React from "react";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer relative inline-flex h-11 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors before:absolute before:inset-x-0 before:inset-y-2 before:rounded-full before:border before:border-control before:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:before:border-primary data-[state=checked]:before:bg-primary data-[state=unchecked]:before:bg-muted motion-reduce:before:transition-none",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none relative z-10 block h-5 w-5 rounded-full border border-control bg-surface shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:border-primary-foreground data-[state=unchecked]:translate-x-1 motion-reduce:transition-none"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
