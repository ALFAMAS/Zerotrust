"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  type ReverificationContext,
  registerReverificationHandler,
  requestReverificationChallenge,
  submitReverificationResponse,
} from "@/lib/reverification";
import { isWebAuthnAvailable, startAuthentication } from "@/lib/webauthn";

type Pending = {
  ctx: ReverificationContext;
  resolve: (verified: boolean) => void;
};

export function ReverificationProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [challengeType, setChallengeType] = useState<"totp" | "otp" | "passkey">("totp");
  const [context, setContext] = useState<ReverificationContext>({});
  const pendingRef = useRef<Pending | null>(null);

  const finish = useCallback((verified: boolean) => {
    pendingRef.current?.resolve(verified);
    pendingRef.current = null;
    setOpen(false);
    setCode("");
    setMessage("");
    setChallengeType("totp");
    setBusy(false);
  }, []);

  useEffect(() => {
    registerReverificationHandler((ctx) => {
      return new Promise<boolean>((resolve) => {
        pendingRef.current = { ctx, resolve };
        setContext(ctx);
        setOpen(true);
        setMessage("");
        setCode("");
        setChallengeType(ctx.level === "hard" && isWebAuthnAvailable() ? "passkey" : "totp");
      });
    });
    return () => registerReverificationHandler(null);
  }, []);

  const runPasskey = async () => {
    setBusy(true);
    setMessage("");
    try {
      const challenge = await requestReverificationChallenge("passkey");
      if (challenge.type !== "passkey" || !challenge.options) {
        setMessage("Passkey verification is not available.");
        return;
      }
      const assertion = await startAuthentication({
        ...challenge.options,
        _challengeKey: (challenge as { _challengeKey?: string })._challengeKey,
      });
      const result = await submitReverificationResponse({ type: "passkey", response: assertion });
      if (result.verified) finish(true);
      else setMessage("Passkey verification failed.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Passkey verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    setBusy(true);
    setMessage("");
    try {
      const challenge = await requestReverificationChallenge("otp");
      setChallengeType("otp");
      setMessage(challenge.message ?? "A verification code was sent to your email.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to send email code.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!code.trim()) {
      setMessage("Enter your verification code.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await submitReverificationResponse({
        type: challengeType === "otp" ? "otp" : "totp",
        code: code.trim(),
      });
      if (result.verified) finish(true);
      else setMessage("Invalid verification code.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const reason = context.reason ?? "Confirm your identity to continue.";

  return (
    <>
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !busy) finish(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify your identity</DialogTitle>
            <DialogDescription>{reason}</DialogDescription>
          </DialogHeader>

          {challengeType !== "passkey" && (
            <div className="space-y-3">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={challengeType === "otp" ? "Email code" : "Authenticator code"}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={busy}
              />
              {message && <p className="text-sm text-muted-foreground">{message}</p>}
            </div>
          )}

          {challengeType === "passkey" && message && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {challengeType === "passkey" ? (
              <Button onClick={runPasskey} disabled={busy}>
                {busy ? "Waiting for passkey…" : "Use passkey"}
              </Button>
            ) : (
              <Button onClick={verifyCode} disabled={busy}>
                {busy ? "Verifying…" : "Verify"}
              </Button>
            )}
            {challengeType !== "passkey" && (
              <Button variant="outline" onClick={sendOtp} disabled={busy}>
                Send email code
              </Button>
            )}
            {challengeType === "passkey" && isWebAuthnAvailable() && (
              <Button
                variant="outline"
                onClick={() => {
                  setChallengeType("totp");
                  setMessage("");
                }}
                disabled={busy}
              >
                Use authenticator instead
              </Button>
            )}
            <Button variant="ghost" onClick={() => finish(false)} disabled={busy}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
