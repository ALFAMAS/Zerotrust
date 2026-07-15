"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { brand } from "@/config/brand";
import { useRegisterAndLoginMutation } from "@/lib/server-state/authForms";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { setToken } from "../../../lib/auth";
import { solveSignupPow } from "../../../lib/pow";

function passwordStrength(p: string): { score: number; label: string; color: string } {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  const levels = [
    { label: "Weak", color: "bg-destructive" },
    { label: "Weak", color: "bg-destructive" },
    { label: "Fair", color: "bg-warning" },
    { label: "Good", color: "bg-secondary-action" },
    { label: "Strong", color: "bg-success" },
    { label: "Very Strong", color: "bg-success" },
  ];
  return { score, ...levels[score] };
}

export default function RegisterPage() {
  const [form, setForm] = useState({ displayName: "", email: "", password: "", confirm: "" });
  const registerMutation = useRegisterAndLoginMutation();
  const { toast } = useToast();
  const strength = passwordStrength(form.password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast({ message: "Passwords do not match", type: "error" });
      return;
    }
    try {
      const pow = await solveSignupPow();
      const data = await registerMutation.mutateAsync({
        email: form.email,
        password: form.password,
        displayName: form.displayName,
        ...pow,
      });
      setToken(data.accessToken, data.refreshToken);
      toast({ message: "Account created! Check your email to verify.", type: "success" });
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : "Registration failed",
        type: "error",
      });
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Create your account
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Start building with {brand.name} — free, no card required
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            type="text"
            required
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="Your Name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            required
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="At least 8 characters"
          />
          {form.password && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full",
                      i <= strength.score ? strength.color : "bg-muted"
                    )}
                  />
                ))}
              </div>
              <span className="mt-1 block text-xs text-muted-foreground">{strength.label}</span>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <PasswordInput
            id="confirm"
            required
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            placeholder="Repeat password"
            className={cn(form.confirm && form.confirm !== form.password && "border-destructive")}
          />
        </div>

        <Button type="submit" disabled={registerMutation.isPending} className="mt-2 w-full">
          {registerMutation.isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:text-primary/80">
          Sign in
        </Link>
      </p>
    </>
  );
}
