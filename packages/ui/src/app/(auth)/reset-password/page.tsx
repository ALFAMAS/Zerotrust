"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { usePasswordResetConfirmMutation } from "@/lib/server-state/authForms";

function ResetForm() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const code = searchParams.get("code") || "";
  const [enteredCode, setEnteredCode] = useState(code);
  const [enteredEmail, setEnteredEmail] = useState(email);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const resetMutation = usePasswordResetConfirmMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!enteredEmail || !enteredCode) {
      setError("Email and reset code are required");
      return;
    }
    setError("");
    try {
      await resetMutation.mutateAsync({
        email: enteredEmail,
        code: enteredCode,
        newPassword: password,
      });
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset failed");
    }
  };

  if (done) {
    return (
      <div className="py-4 text-center">
        <div className="mb-4 text-4xl">✅</div>
        <h2 className="mb-2 text-xl font-bold text-foreground">Password updated</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Your password has been changed. You can now sign in.
        </p>
        <Button asChild>
          <Link href="/login">Sign In</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold text-foreground">New password</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Enter the 6-digit reset code from your email and choose a new password.
      </p>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={enteredEmail}
            onChange={(e) => setEnteredEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="code">Reset code</Label>
          <Input
            id="code"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={enteredCode}
            onChange={(e) => setEnteredCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="font-mono tracking-[0.3em]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <PasswordInput
            id="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            placeholder="At least 8 characters"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <PasswordInput
            id="confirm"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat password"
          />
        </div>
        <Button type="submit" disabled={resetMutation.isPending} className="w-full">
          {resetMutation.isPending ? "Updating…" : "Update Password"}
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
      <ResetForm />
    </Suspense>
  );
}
