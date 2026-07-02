"use client";

import { MailWarning, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";

const DISMISS_KEY = "za_verify_email_dismissed";

/**
 * Soft, dismissible "verify your email" banner. Self-fetches the current user
 * and renders only when the account's email is unverified.
 */
export default function VerifyEmailBanner() {
  const { toast } = useToast();
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    api
      .get<{ emailVerified?: boolean; email?: string }>("/auth/me")
      .then((u) => {
        if (u && u.emailVerified === false) {
          setEmail(u.email ?? null);
          setShow(true);
        }
      })
      .catch(() => {});
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  async function resend() {
    setResending(true);
    try {
      await api.post("/auth/verify-email/resend");
      toast({ message: "Verification email sent — check your inbox.", type: "success" });
    } catch (err: any) {
      toast({ message: err.message || "Couldn't send the email. Try again.", type: "error" });
    } finally {
      setResending(false);
    }
  }

  if (!show) return null;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5 text-sm text-amber-200">
          <MailWarning className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <span>Please verify your email{email ? ` (${email})` : ""} to secure your account.</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={resend}
            disabled={resending}
            className="border-amber-500/40 text-amber-100 hover:bg-amber-500/20 hover:text-amber-50"
          >
            {resending ? "Sending…" : "Resend email"}
          </Button>
          <Button size="sm" asChild className="bg-amber-500 text-amber-950 hover:bg-amber-400">
            <Link href="/verify-email">Enter code</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-amber-300 hover:bg-amber-500/20 hover:text-amber-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
