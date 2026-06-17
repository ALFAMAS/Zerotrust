"use client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { isWebAuthnAvailable, startRegistration } from "../../../lib/webauthn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KeyRound } from "lucide-react";

export default function SecurityPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [totpSetup, setTotpSetup] = useState<any>(null);
  const [totpCode, setTotpCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api
      .get<any>("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const startTOTP = async () => {
    const data = await api.post<any>("/auth/mfa/totp/setup").catch(() => null);
    if (data) setTotpSetup(data);
  };

  const verifyTOTP = async () => {
    try {
      const res = await api.post<any>("/auth/mfa/totp/verify", { code: totpCode });
      setMsg("TOTP enabled successfully! Two-factor authentication is now required at login.");
      setTotpSetup(null);
      setTotpCode("");
      if (Array.isArray(res?.backupCodes)) setBackupCodes(res.backupCodes);
      const u = await api.get<any>("/auth/me");
      setUser(u);
    } catch (err: any) {
      setMsg(err.message || "TOTP verification failed");
    }
  };

  const [addingPasskey, setAddingPasskey] = useState(false);

  const addPasskey = async () => {
    if (!isWebAuthnAvailable()) {
      setMsg("This browser does not support passkeys.");
      return;
    }
    setMsg("");
    setAddingPasskey(true);
    try {
      const name =
        (typeof window !== "undefined" && window.prompt("Name this passkey", "My device")) ||
        "Passkey";
      const options = await api.post<any>("/auth/passkey/register/options");
      const attestation = await startRegistration(options);
      await api.post("/auth/passkey/register/verify", { ...attestation, name });
      setMsg("Passkey registered successfully.");
      const u = await api.get<any>("/auth/me");
      setUser(u);
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        setMsg("Passkey registration was cancelled.");
      } else {
        setMsg(err?.message || "Failed to register passkey.");
      }
    } finally {
      setAddingPasskey(false);
    }
  };

  const disconnectOAuth = async (provider: string) => {
    if (!confirm(`Disconnect your ${provider} account?`)) return;
    try {
      await api.delete(`/auth/oauth/${provider}`);
      setMsg(`Disconnected ${provider}. Other active sessions may have been signed out.`);
      const u = await api.get<any>("/auth/me");
      setUser(u);
    } catch (err: any) {
      setMsg(err.message || `Failed to disconnect ${provider}`);
    }
  };

  const disableTOTP = async () => {
    if (
      !confirm(
        "Disable two-factor authentication? Your account will be protected by password only."
      )
    )
      return;
    try {
      await api.delete("/auth/mfa/totp");
      setMsg("TOTP disabled. Two-factor authentication is no longer required at login.");
      setBackupCodes(null);
      const u = await api.get<any>("/auth/me");
      setUser(u);
    } catch (err: any) {
      setMsg(err.message || "Failed to disable TOTP");
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Security Settings</h1>

      {msg && (
        <Alert>
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      )}

      {/* TOTP */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Authenticator App (TOTP)</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Use an app like Google Authenticator or 1Password.
              </p>
            </div>
            <Badge variant={user?.mfa?.totp?.enabled ? "success" : "secondary"}>
              {user?.mfa?.totp?.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!user?.mfa?.totp?.enabled && !totpSetup && (
            <Button onClick={startTOTP}>Set Up TOTP</Button>
          )}

          {user?.mfa?.totp?.enabled && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Two-factor authentication is active on your account.
                {typeof user?.mfa?.totp?.backupCodesRemaining === "number" && (
                  <> {user.mfa.totp.backupCodesRemaining} backup code(s) remaining.</>
                )}
              </p>
              <Button variant="destructive" onClick={disableTOTP}>
                Disable
              </Button>
            </div>
          )}

          {backupCodes && (
            <Alert className="mb-4">
              <AlertDescription>
                <p className="mb-2 font-medium text-foreground">
                  Save your backup codes
                </p>
                <p className="mb-3 text-sm text-muted-foreground">
                  Each code works once if you lose access to your authenticator. They
                  won&apos;t be shown again.
                </p>
                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {backupCodes.map((c) => (
                    <span key={c} className="rounded bg-muted px-2 py-1">
                      {c}
                    </span>
                  ))}
                </div>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    void navigator.clipboard?.writeText(backupCodes.join("\n"));
                    setMsg("Backup codes copied to clipboard.");
                  }}
                >
                  Copy codes
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {totpSetup && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Scan this QR code with your authenticator app:
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={totpSetup.qrCodeUrl}
                alt="TOTP QR Code"
                className="h-40 w-40 rounded-lg bg-white p-2"
              />
              <div className="flex gap-2">
                <Input
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                />
                <Button onClick={verifyTOTP} className="bg-emerald-600 hover:bg-emerald-500">
                  Verify
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Passkeys */}
      <Card>
        <CardHeader>
          <CardTitle>Passkeys &amp; Security Keys</CardTitle>
          <p className="text-sm text-muted-foreground">
            Phishing-resistant hardware keys and biometrics.
          </p>
        </CardHeader>
        <CardContent>
          {user?.passkeys?.length > 0 ? (
            <div className="mb-4 space-y-2">
              {user.passkeys.map((pk: any) => (
                <div
                  key={pk.credentialId}
                  className="flex items-center justify-between rounded-lg bg-muted p-3"
                >
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {pk.name || "Security Key"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Added {new Date(pk.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">No passkeys registered yet.</p>
          )}

          <Button variant="outline" onClick={addPasskey} disabled={addingPasskey}>
            <KeyRound />
            {addingPasskey ? "Waiting for device…" : "Add passkey"}
          </Button>
        </CardContent>
      </Card>

      {/* OAuth */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <p className="text-sm text-muted-foreground">
            Social login providers linked to your account.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {["google", "github", "facebook", "apple"].map((provider) => {
              const linked = user?.oauthProviders?.some((p: any) => p.provider === provider);
              return (
                <div
                  key={provider}
                  className="flex items-center justify-between rounded-lg bg-muted p-3"
                >
                  <span className="text-sm capitalize text-foreground">{provider}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={linked ? "success" : "secondary"}>
                      {linked ? "Connected" : "Not connected"}
                    </Badge>
                    {linked && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => disconnectOAuth(provider)}
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
