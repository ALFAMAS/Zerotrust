"use client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
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
      await api.post("/auth/mfa/totp/verify", { code: totpCode });
      setMsg("TOTP enabled successfully!");
      setTotpSetup(null);
      setTotpCode("");
      const u = await api.get<any>("/auth/me");
      setUser(u);
    } catch (err: any) {
      setMsg(err.message || "TOTP verification failed");
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

          <Button
            variant="outline"
            onClick={() =>
              alert(
                "Passkey registration requires @simplewebauthn/browser. Implement in your app."
              )
            }
          >
            <KeyRound />
            Add passkey
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
                  <Badge variant={linked ? "success" : "secondary"}>
                    {linked ? "Connected" : "Not connected"}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
