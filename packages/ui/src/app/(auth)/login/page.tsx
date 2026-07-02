"use client";
import { Fingerprint } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { brand } from "@/config/brand";
import { useOAuthAuthorizeMutation } from "@/lib/server-state/auth";
import {
  useLoginMfaMutation,
  useLoginMutation,
  useOAuthExchangeMutation,
  usePasskeyAuthOptionsMutation,
  usePasskeyAuthVerifyMutation,
} from "@/lib/server-state/authForms";
import { useToast } from "@/lib/toast";
import { setToken } from "../../../lib/auth";
import { navigateToSafeExternal, navigateToSafeRelative } from "../../../lib/safeRedirect";
import { isWebAuthnAvailable, startAuthentication } from "../../../lib/webauthn";

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const { toast } = useToast();

  const loginMutation = useLoginMutation();
  const loginMfaMutation = useLoginMfaMutation();
  const passkeyOptionsMutation = usePasskeyAuthOptionsMutation();
  const passkeyVerifyMutation = usePasskeyAuthVerifyMutation();
  const oauthExchangeMutation = useOAuthExchangeMutation();
  const oauthAuthorizeMutation = useOAuthAuthorizeMutation();

  const loading =
    loginMutation.isPending ||
    loginMfaMutation.isPending ||
    passkeyOptionsMutation.isPending ||
    passkeyVerifyMutation.isPending ||
    oauthExchangeMutation.isPending ||
    oauthAuthorizeMutation.isPending;

  const oauthTried = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get("oauth_code");
    const error = params.get("error");

    if (error) {
      toast({
        message: params.get("message") || "OAuth sign-in failed",
        type: "error",
      });
      window.history.replaceState({}, "", "/login");
      return;
    }

    if (!oauthCode || oauthTried.current) return;
    oauthTried.current = true;

    oauthExchangeMutation
      .mutateAsync({ code: oauthCode })
      .then((data) => {
        setToken(data.accessToken, data.refreshToken);
        toast({ message: "Welcome!", type: "success" });
        window.location.replace("/dashboard");
      })
      .catch(() => {
        toast({
          message: "OAuth sign-in failed. Please try again.",
          type: "error",
        });
        window.history.replaceState({}, "", "/login");
      });
  }, [toast, oauthExchangeMutation]);

  const finishLogin = (data: { accessToken: string; refreshToken: string }) => {
    setToken(data.accessToken, data.refreshToken);
    toast({ message: "Welcome back!", type: "success" });
    const next = new URLSearchParams(window.location.search).get("next");
    navigateToSafeRelative(next, "/dashboard");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await loginMutation.mutateAsync(form);
      if (data.mfaRequired) {
        setMfaToken(data.mfaToken ?? null);
        toast({
          message: "Enter your authenticator code to continue.",
          type: "info",
        });
        return;
      }
      finishLogin(data);
    } catch (err: unknown) {
      toast({
        message:
          err instanceof Error ? err.message : "Login failed. Please check your credentials.",
        type: "error",
      });
    }
  };

  const handlePasskeyLogin = async () => {
    if (!isWebAuthnAvailable()) {
      toast({
        message: "This browser does not support passkeys.",
        type: "error",
      });
      return;
    }
    try {
      const options = await passkeyOptionsMutation.mutateAsync({
        email: form.email || undefined,
      });
      const assertion = await startAuthentication(options);
      const data = await passkeyVerifyMutation.mutateAsync({
        ...assertion,
        challengeKey: options._challengeKey as string | undefined,
        email: form.email || undefined,
      });
      finishLogin(data);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast({ message: "Passkey sign-in was cancelled.", type: "error" });
      } else {
        toast({
          message: err instanceof Error ? err.message : "Passkey sign-in failed.",
          type: "error",
        });
      }
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    try {
      const data = await loginMfaMutation.mutateAsync({
        mfaToken,
        code: mfaCode.trim(),
      });
      finishLogin(data);
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : "Invalid code. Please try again.",
        type: "error",
      });
    }
  };

  const handleOAuthLogin = async (provider: string) => {
    try {
      const { authorizeUrl } = await oauthAuthorizeMutation.mutateAsync(provider);
      navigateToSafeExternal(authorizeUrl, "/login");
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : `Failed to initiate ${provider} login`,
        type: "error",
      });
    }
  };

  if (mfaToken) {
    return (
      <>
        <div className="mb-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Two-factor authentication
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app, or a backup code.
          </p>
        </div>
        <form onSubmit={handleMfaSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mfa-code">Authentication code</Label>
            <Input
              id="mfa-code"
              inputMode="text"
              autoComplete="one-time-code"
              autoFocus
              required
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="123456"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Verifying…" : "Verify"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setMfaToken(null);
              setMfaCode("");
            }}
          >
            Back to sign in
          </Button>
        </form>
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Sign in to your {brand.name} account</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
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
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs text-primary hover:text-primary/80">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            required
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            or continue with
          </span>
        </div>
      </div>
      <div className="grid gap-2.5">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleOAuthLogin("google")}
        >
          <svg
            role="img"
            aria-label="Sign in with Google"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="currentColor"
          >
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleOAuthLogin("github")}
        >
          <svg
            role="img"
            aria-label="Sign in with GitHub"
            viewBox="0 0 24 24"
            className="h-4 w-4 fill-current"
          >
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Continue with GitHub
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={handlePasskeyLogin}
        >
          <Fingerprint />
          Sign in with a passkey
        </Button>
      </div>
      <div className="mt-5 text-center">
        <Link href="/magic-link" className="text-sm font-medium text-primary hover:text-primary/80">
          Email me a magic link instead
        </Link>
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-primary hover:text-primary/80">
          Create one
        </Link>
      </p>
    </>
  );
}
