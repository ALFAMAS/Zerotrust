"use client";

import Modal from "./Modal";

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
        <p className="text-sm text-gray-300">
          <span className="font-semibold text-white">{feature}</span> is available on the{" "}
          <span className="font-semibold text-indigo-400">{requiredPlan}</span> plan.
        </p>
        {variant === "modal" && (
          <p className="mt-2 text-sm text-gray-400">
            Upgrade to unlock {feature.toLowerCase()} plus everything else in {requiredPlan} —
            cancel anytime.
          </p>
        )}
      </div>
      <a
        href="/dashboard/billing"
        className={`${
          variant === "modal" ? "mt-5 w-full text-center block" : "shrink-0"
        } px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors`}
      >
        Upgrade to {requiredPlan}
      </a>
    </div>
  );

  if (variant === "banner") {
    return <div className="bg-indigo-950/50 border border-indigo-800 rounded-xl p-4">{body}</div>;
  }

  return (
    <Modal title={`Upgrade to ${requiredPlan}`} onClose={onClose ?? (() => {})}>
      {body}
    </Modal>
  );
}
