"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema } from "@zerotrust/shared-types/auth";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
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

// Extends the API's registerSchema (shared via @zerotrust/shared-types) with a
// client-only confirm field, so client-side validation matches server rules exactly.
const registerFormSchema = registerSchema
  .extend({ confirm: z.string().min(1, "Confirm your password") })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

type RegisterFormValues = z.infer<typeof registerFormSchema>;

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
  const registerMutation = useRegisterAndLoginMutation();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { displayName: "", email: "", password: "", confirm: "" },
  });

  const password = watch("password");
  const confirm = watch("confirm");
  const strength = passwordStrength(password ?? "");

  const onSubmit = async (values: RegisterFormValues) => {
    try {
      const pow = await solveSignupPow();
      const data = await registerMutation.mutateAsync({
        email: values.email,
        password: values.password,
        displayName: values.displayName,
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            type="text"
            placeholder="Your Name"
            {...register("displayName")}
          />
          {errors.displayName && (
            <p className="text-xs text-destructive">{errors.displayName.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register("email")}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            {...register("password")}
          />
          {password && (
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
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <PasswordInput
            id="confirm"
            placeholder="Repeat password"
            className={cn(confirm && confirm !== password && "border-destructive")}
            {...register("confirm")}
          />
          {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
        </div>

        <Button
          type="submit"
          disabled={isSubmitting || registerMutation.isPending}
          className="mt-2 w-full"
        >
          {isSubmitting || registerMutation.isPending ? "Creating account…" : "Create account"}
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
