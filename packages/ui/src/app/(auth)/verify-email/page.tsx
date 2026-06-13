"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { isAuthenticated } from "../../../lib/auth";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = "idle" | "verifying" | "success" | "error";

function VerifyEmailInner() {
  const params = useSearchParams();
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("idle");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const autoTried = useRef(false);

  async function verify(emailValue: string, codeValue: string) {
    setStatus("verifying");
    try {
      await api.post("/auth/verify-email", { email: emailValue, code: codeValue }, true);
      setStatus("success");
      toast({ message: "Email verified — you're all set!", type: "success" });
      setTimeout(() => {
        window.location.href = isAuthenticated() ? "/dashboard" : "/login";
      }, 1500);
    } catch (err: any) {
      setStatus("error");
      toast({
        message: err.message || "Invalid or expired code. Request a new one.",
        type: "error",
      });
    }
  }

  // Auto-verify when arriving from the email magic link (?email=&code=)
  useEffect(() => {
    if (autoTried.current) return;
    const qEmail = params.get("email");
    const qCode = params.get("code");
    if (qEmail) setEmail(qEmail);
    if (qCode) setCode(qCode);
    if (qEmail && qCode) {
      autoTried.current = true;
      void verify(qEmail, qCode);
    }
  }, [params]);

  if (status === "success") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl text-emerald-400">
          ✓
        </div>
        <h1 className="mb-1 text-2xl font-bold text-foreground">Email verified</h1>
        <p className="text-sm text-muted-foreground">Redirecting you now…</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold text-foreground">Verify your email</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Enter the 6-digit code we emailed you, or open the link in that email.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void verify(email, code);
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
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
            className="text-center text-lg tracking-[0.5em]"
          />
        </div>

        <Button type="submit" disabled={status === "verifying"} className="w-full">
          {status === "verifying" ? "Verifying…" : "Verify email"}
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
    <Suspense
      fallback={<p className="text-center text-sm text-muted-foreground">Loading…</p>}
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
