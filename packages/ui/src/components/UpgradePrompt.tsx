"use client";

import Modal from "./Modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Consistent "upgrade to Pro" prompt shown whenever a plan gate blocks an
 * action. Render as a modal (default) or an inline banner.
 *
 *   {gateBlocked && (
 *     <UpgradePrompt feature="Custom roles" onClose={() => setGateBlocked(false)} />
 *   )}
 */

interface UpgradePromptProps {
  /** Human name of the gated feature, e.g. "Custom roles" */
  feature: string;
  /** Plan that unlocks it (default "Pro") */
  requiredPlan?: string;
  variant?: "modal" | "banner";
  onClose?: () => void;
}

export default function UpgradePrompt({
  feature,
  requiredPlan = "Pro",
  variant = "modal",
  onClose,
}: UpgradePromptProps) {
  const body = (
    <div className={variant === "banner" ? "flex items-center justify-between gap-4" : ""}>
      <div>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{feature}</span> is available on the{" "}
          <span className="font-semibold text-primary">{requiredPlan}</span> plan.
        </p>
        {variant === "modal" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Upgrade to unlock {feature.toLowerCase()} plus everything else in {requiredPlan} —
            cancel anytime.
          </p>
        )}
      </div>
      <Button asChild className={cn(variant === "modal" ? "mt-5 w-full" : "shrink-0")}>
        <a href="/dashboard/billing">Upgrade to {requiredPlan}</a>
      </Button>
    </div>
  );

  if (variant === "banner") {
    return <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">{body}</div>;
  }

  return (
    <Modal title={`Upgrade to ${requiredPlan}`} onClose={onClose ?? (() => {})}>
      {body}
    </Modal>
  );
}
