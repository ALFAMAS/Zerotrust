"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { setToken } from "@/lib/auth";
import { api } from "../../../../lib/api";

type Status = "verifying" | "success" | "error";

type Tokens = { accessToken: string; refreshToken?: string };

/** Only allow same-origin, non-protocol-relative paths to avoid open redirects. */
function safeRedirect(value: string | null): string {
  if (value?.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}

function VerifyMagicLinkInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState<Status>("verifying");
  const [error, setError] = useState("");
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;

    const token = params.get("token");
    const email = params.get("email");
    const redirect = safeRedirect(params.get("redirect"));

    if (!token || !email) {
      setStatus("error");
      setError("This magic link is missing its token. Request a new one to sign in.");
      return;
    }

    async function verify() {
      try {
        // skipAuth: this is a sign-in flow, there's no session yet.
        const tokens = await api.post<Tokens>("/auth/magic-link/verify", { email, token }, true);
        setToken(tokens.accessToken, tokens.refreshToken);
        setStatus("success");
        window.location.href = redirect;
      } catch (err: any) {
        setStatus("error");
        setError(err?.message || "This magic link is invalid or has expired. Request a new one.");
      }
    }

    // handle promise explicitly to avoid floating-promise lint errors
    verify().catch((err: any) => {
      setStatus("error");
      setError(err?.message || "This magic link is invalid or has expired. Request a new one.");
    });
  }, [params]);

  if (status === "error") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive ring-1 ring-destructive/30">
          <XCircle className="h-7 w-7" />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Sign-in link invalid
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{error}</p>
        <Link
          href="/magic-link"
          className="mt-6 inline-block text-sm font-medium text-primary hover:text-primary/80"
        >
          Request a new magic link
        </Link>
      </div>
    );
  }

  return (
    <div className="py-4 text-center">
      {status === "success" ? (
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
          <CheckCircle2 className="h-7 w-7" />
        </div>
      ) : (
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      )}
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {status === "success" ? "Signed in" : "Verifying your link…"}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {status === "success"
          ? "Taking you to your dashboard…"
          : "Hang tight while we confirm your magic link."}
      </p>
    </div>
  );
}

export default function VerifyMagicLinkPage() {
  return (
    <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Loading…</p>}>
      <VerifyMagicLinkInner />
    </Suspense>
  );
}
