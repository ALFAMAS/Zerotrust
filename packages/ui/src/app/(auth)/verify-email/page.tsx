"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVerifyEmailMutation } from "@/lib/server-state/authForms";
import { useToast } from "@/lib/toast";
import { isAuthenticated } from "../../../lib/auth";

type Status = "idle" | "verifying" | "success" | "error";

function VerifyEmailInner() {
  const params = useSearchParams();
  const { toast } = useToast();
  const verifyMutation = useVerifyEmailMutation();
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState("");
  const autoTried = useRef(false);

  const verify = useCallback(
    async (codeValue: string) => {
      setStatus("verifying");
      try {
        await verifyMutation.mutateAsync({ code: codeValue });
        setStatus("success");
        toast({ message: "Email verified — you're all set!", type: "success" });
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 1500);
      } catch (err: unknown) {
        setStatus("error");
        const apiErr = err as { status?: number; message?: string };
        if (apiErr.status === 401) {
          toast({
            message: "Please sign in to verify your email.",
            type: "error",
          });
          return;
        }
        toast({
          message: apiErr.message || "Invalid or expired code. Request a new one.",
          type: "error",
        });
      }
    },
    [toast, verifyMutation]
  );

  useEffect(() => {
    if (autoTried.current) return;
    const qCode = params.get("code");
    if (qCode) setCode(qCode);
    if (qCode && isAuthenticated()) {
      autoTried.current = true;
      void verify(qCode);
    }
  }, [params, verify]);

  if (status === "success") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Email verified
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Taking you to your dashboard…</p>
      </div>
    );
  }

  const verifying = status === "verifying" || verifyMutation.isPending;

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Verify your email
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter the 6-digit code we emailed you, or open the link in that message.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void verify(code);
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="h-14 text-center font-mono text-2xl tracking-[0.4em] placeholder:tracking-[0.4em]"
          />
        </div>

        <Button type="submit" disabled={verifying} className="w-full">
          {verifying ? "Verifying…" : "Verify email"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Didn&apos;t get a code?{" "}
        <Link href="/dashboard" className="font-medium text-primary hover:text-primary/80">
          Resend from your dashboard
        </Link>
      </p>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Loading…</p>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
