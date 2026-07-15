"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePasswordResetRequestMutation } from "@/lib/server-state/authForms";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const resetMutation = usePasswordResetRequestMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await resetMutation.mutateAsync({ email });
    setSent(true);
  };

  if (sent) {
    return (
      <div className="py-4 text-center">
        <div className="mb-4 text-4xl">📬</div>
        <h2 className="mb-2 text-xl font-bold text-foreground">Check your email</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          If an account with that email exists, a password reset link has been sent.
        </p>
        <Link href="/login" className="text-sm text-primary hover:text-primary/80">
          ← Back to login
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold text-foreground">Reset password</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        We&apos;ll send a reset link to your email.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <Button type="submit" disabled={resetMutation.isPending} className="w-full">
          {resetMutation.isPending ? "Sending…" : "Send Reset Link"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:text-primary/80">
          ← Back to login
        </Link>
      </p>
    </>
  );
}
