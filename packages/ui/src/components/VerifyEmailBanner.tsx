"use client";

import { MailWarning, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuthMeQuery, useResendVerificationEmailMutation } from "@/lib/server-state/auth";
import { useToast } from "@/lib/toast";

const DISMISS_KEY = "za_verify_email_dismissed";

/**
 * Soft, dismissible "verify your email" banner. Self-fetches the current user
 * and renders only when the account's email is unverified.
 */
export default function VerifyEmailBanner() {
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(
    () => typeof sessionStorage !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1"
  );
  const { data: me } = useAuthMeQuery(!dismissed);
  const resendMutation = useResendVerificationEmailMutation();

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  async function resend() {
    try {
      await resendMutation.mutateAsync();
      toast({ message: "Verification email sent — check your inbox.", type: "success" });
    } catch (err: any) {
      toast({ message: err.message || "Couldn't send the email. Try again.", type: "error" });
    }
  }

  if (dismissed || !me || me.emailVerified !== false) return null;
  const email = me.email ?? null;

  return (
    <div className="border-b border-warning bg-warning-subtle">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 text-sm text-warning-subtle-foreground">
          <MailWarning className="mt-1 h-4 w-4 flex-shrink-0 text-warning-subtle-foreground" />
          <span>Please verify your email{email ? ` (${email})` : ""} to secure your account.</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={resend}
            disabled={resendMutation.isPending}
            className="border-warning text-warning-subtle-foreground hover:bg-warning-subtle/70 hover:text-warning-subtle-foreground"
          >
            {resendMutation.isPending ? "Sending…" : "Resend email"}
          </Button>
          <Button
            size="sm"
            asChild
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Link href="/verify-email">Enter code</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-warning-subtle-foreground hover:bg-warning-subtle/70 hover:text-warning-subtle-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
